from datetime import datetime
from typing import List, Dict, Optional
from pydantic import BaseModel


class SQLResponse(BaseModel):
    status: str
    rowcount: int
    rows: List[Dict]
    column_names: List[str]
    error_message: Optional[str] = None


class SQLAlteration(BaseModel):
    environment: str
    altered_sql: str
    timestamp: datetime
    altered_by: str
    reason: str


class SQLChange(BaseModel):
    change_id: str
    sql_content: str
    original_sql_content: str
    description: str
    environment: str
    target_databases: List[str]
    applied_to: List[str]
    sql_responses: Dict[str, SQLResponse]
    timestamp: datetime
    created_by: str
    is_rolled_back: bool = False
    rollback_sql: Optional[str] = None
    rollback_responses: Optional[Dict[str, SQLResponse]] = None
    alterations: List[SQLAlteration] = []


class SQLChangeCreate(BaseModel):
    sql_content: str
    description: str
    target_databases: List[str]
    environment: str
    created_by: str
    rollback_sql: Optional[str] = None


class SQLChangeUpdate(BaseModel):
    sql_content: Optional[str] = None
    description: Optional[str] = None
    target_databases: Optional[List[str]] = None
    rollback_sql: Optional[str] = None


class SQLAlterationCreate(BaseModel):
    environment: str
    altered_sql: str
    altered_by: str
    reason: str
