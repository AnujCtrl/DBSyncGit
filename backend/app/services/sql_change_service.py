import os
import json
import hashlib
from datetime import datetime
from typing import List, Dict, Optional
from pathlib import Path
import logging

from app.db.database import db_manager
from app.models.sql_change import (
    SQLChange, SQLChangeCreate, SQLResponse, SQLAlteration, SQLAlterationCreate
)


class SQLChangeService:
    def __init__(self):
        self.changes_dir = Path("db_changes")
        self.changes_dir.mkdir(exist_ok=True)
        self.setup_logging()

    def setup_logging(self):
        logging.basicConfig(
            filename='app.log',
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )

    def _generate_change_id(self, sql_content: str) -> str:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        content_hash = hashlib.md5(sql_content.encode()).hexdigest()[:8]
        return f"{timestamp}_{content_hash}"

    def _save_change(self, change: SQLChange):
        env_dir = self.changes_dir / change.environment
        env_dir.mkdir(exist_ok=True)

        # Save SQL content
        with open(env_dir / f"{change.change_id}.sql", 'w') as f:
            f.write(change.sql_content)

        # Save metadata
        with open(env_dir / f"{change.change_id}.json", 'w') as f:
            json.dump(change.dict(), f, indent=2, default=str)

    def _load_change(self, change_id: str, environment: str) -> Optional[SQLChange]:
        env_dir = self.changes_dir / environment
        json_file = env_dir / f"{change_id}.json"

        if not json_file.exists():
            return None

        with open(json_file, 'r') as f:
            data = json.load(f)
            return SQLChange(**data)

    def create_change(self, change_data: SQLChangeCreate) -> SQLChange:
        change_id = self._generate_change_id(change_data.sql_content)

        change = SQLChange(
            change_id=change_id,
            sql_content=change_data.sql_content,
            original_sql_content=change_data.sql_content,
            description=change_data.description,
            environment=change_data.environment,
            target_databases=change_data.target_databases,
            applied_to=[],
            sql_responses={},
            timestamp=datetime.now(),
            created_by=change_data.created_by,
            rollback_sql=change_data.rollback_sql
        )

        self._save_change(change)
        return change

    def add_alteration(self, change_id: str, environment: str, alteration_data: SQLAlterationCreate) -> SQLChange:
        change = self._load_change(change_id, environment)
        if not change:
            raise ValueError(f"Change {change_id} not found in {environment}")

        alteration = SQLAlteration(
            environment=alteration_data.environment,
            altered_sql=alteration_data.altered_sql,
            timestamp=datetime.now(),
            altered_by=alteration_data.altered_by,
            reason=alteration_data.reason
        )

        change.alterations.append(alteration)
        change.sql_content = alteration_data.altered_sql

        self._save_change(change)
        return change

    def apply_change(self, change_id: str, environment: str, target_databases: Optional[List[str]] = None) -> SQLChange:
        change = self._load_change(change_id, environment)
        if not change:
            raise ValueError(f"Change {change_id} not found in {environment}")

        if target_databases:
            change.target_databases = target_databases

        for db_name in change.target_databases:
            if db_name in change.applied_to:
                continue

            conn = None
            cursor = None
            try:
                conn = db_manager.get_connection(environment, db_name)
                cursor = conn.cursor()
                cursor.execute(change.sql_content)

                response = SQLResponse(
                    status='success',
                    rowcount=cursor.rowcount,
                    rows=cursor.fetchall() if cursor.description else [],
                    column_names=[
                        desc[0] for desc in cursor.description] if cursor.description else []
                )

                conn.commit()
                change.applied_to.append(db_name)
                change.sql_responses[db_name] = response
                logging.info(
                    f"Successfully applied change {change_id} to {db_name}")

            except Exception as e:
                if conn:
                    conn.rollback()
                response = SQLResponse(
                    status='error',
                    rowcount=0,
                    rows=[],
                    column_names=[],
                    error_message=str(e)
                )
                change.sql_responses[db_name] = response
                logging.error(
                    f"Error applying change {change_id} to {db_name}: {str(e)}")
                raise

            finally:
                if cursor:
                    cursor.close()
                if conn:
                    conn.close()

        self._save_change(change)
        return change

    def rollback_change(self, change_id: str, environment: str) -> SQLChange:
        change = self._load_change(change_id, environment)
        if not change:
            raise ValueError(f"Change {change_id} not found in {environment}")

        if not change.rollback_sql:
            raise ValueError("No rollback SQL defined for this change")

        for db_name in change.applied_to:
            conn = None
            cursor = None
            try:
                conn = db_manager.get_connection(environment, db_name)
                cursor = conn.cursor()
                cursor.execute(change.rollback_sql)

                response = SQLResponse(
                    status='success',
                    rowcount=cursor.rowcount,
                    rows=cursor.fetchall() if cursor.description else [],
                    column_names=[
                        desc[0] for desc in cursor.description] if cursor.description else []
                )

                conn.commit()
                change.rollback_responses = change.rollback_responses or {}
                change.rollback_responses[db_name] = response
                change.applied_to.remove(db_name)
                logging.info(
                    f"Successfully rolled back change {change_id} from {db_name}")

            except Exception as e:
                if conn:
                    conn.rollback()
                response = SQLResponse(
                    status='error',
                    rowcount=0,
                    rows=[],
                    column_names=[],
                    error_message=str(e)
                )
                change.rollback_responses = change.rollback_responses or {}
                change.rollback_responses[db_name] = response
                logging.error(
                    f"Error rolling back change {change_id} from {db_name}: {str(e)}")
                raise

            finally:
                if cursor:
                    cursor.close()
                if conn:
                    conn.close()

        change.is_rolled_back = True
        self._save_change(change)
        return change

    def get_pending_changes(self, target_environment: str) -> List[SQLChange]:
        if target_environment == 'qa':
            return []

        prev_env = 'qa' if target_environment == 'production' else 'production'
        prev_changes = self.get_all_changes(prev_env)
        target_changes = self.get_all_changes(target_environment)

        target_change_ids = {change.change_id for change in target_changes}
        return [change for change in prev_changes if change.change_id not in target_change_ids and not change.is_rolled_back and change.applied_to == change.target_databases]

    def get_all_changes(self, environment: str) -> List[SQLChange]:
        env_dir = self.changes_dir / environment
        if not env_dir.exists():
            return []

        changes = []
        for json_file in env_dir.glob('*.json'):
            try:
                with open(json_file, 'r') as f:
                    data = json.load(f)
                    changes.append(SQLChange(**data))
            except Exception as e:
                logging.error(f"Error reading change file {json_file}: {e}")
                continue

        return sorted(changes, key=lambda x: x.timestamp, reverse=True)


sql_change_service = SQLChangeService()
