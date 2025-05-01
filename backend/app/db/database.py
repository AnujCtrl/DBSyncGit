import os
from typing import Dict, Optional
import mysql.connector
from mysql.connector import pooling, Error
from dotenv import load_dotenv
import logging

load_dotenv()


class DatabaseConnectionError(Exception):
    """Custom exception for database connection errors"""
    pass


class DatabaseManager:
    def __init__(self):
        self.connection_pools: Dict[str, pooling.MySQLConnectionPool] = {}
        self.setup_logging()
        self.setup_connection_pools()

    def setup_logging(self):
        logging.basicConfig(
            filename='app.log',
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )

    def setup_connection_pools(self):
        environments = {
            'qa': {
                'host': os.getenv('QA_DB_HOST'),
                'port': int(os.getenv('QA_DB_PORT', 3306)),
                'user': os.getenv('QA_DB_USER'),
                'password': os.getenv('QA_DB_PASSWORD')
            },
            'production': {
                'host': os.getenv('PROD_DB_HOST'),
                'port': int(os.getenv('PROD_DB_PORT', 3306)),
                'user': os.getenv('PROD_DB_USER'),
                'password': os.getenv('PROD_DB_PASSWORD')
            },
            'enterprise': {
                'host': os.getenv('ENT_DB_HOST', 'localhost'),
                'port': int(os.getenv('ENT_DB_PORT', 3306)),
                'user': os.getenv('ENT_DB_USER', 'root'),
                'password': os.getenv('ENT_DB_PASSWORD', 'root')
            }
        }

        for env, config in environments.items():
            if not all(config.values()):  # Skip if any config value is empty
                logging.warning(
                    f"Skipping {env} environment setup due to missing configuration")
                continue

            try:
                # Test connection before creating pool
                test_conn = mysql.connector.connect(
                    host=config['host'],
                    port=config['port'],
                    user=config['user'],
                    password=config['password'],
                    database='router',
                    connection_timeout=5
                )
                test_conn.close()

                db_config = {
                    'pool_name': f'{env}_pool',
                    'pool_size': 5,
                    'host': config['host'],
                    'port': config['port'],
                    'user': config['user'],
                    'password': config['password'],
                    'database': 'router',
                    'connection_timeout': 30,
                    'get_warnings': True,
                    'raise_on_warnings': True
                }
                self.connection_pools[env] = pooling.MySQLConnectionPool(
                    **db_config)
                logging.info(
                    f"Successfully created connection pool for {env} environment")

            except Error as e:
                logging.error(
                    f"Failed to create connection pool for {env} environment: {str(e)}")
                continue
            except Exception as e:
                logging.error(
                    f"Unexpected error creating connection pool for {env} environment: {str(e)}")
                continue

    def get_connection(self, environment: str, database: str = 'router') -> Optional[mysql.connector.connection.MySQLConnection]:
        """Get a connection from the appropriate pool"""
        if environment not in self.connection_pools:
            logging.warning(
                f"Connection pool not available for environment: {environment}")
            return None

        try:
            conn = self.connection_pools[environment].get_connection()
            if database != 'router':
                conn.database = database
            return conn
        except Error as e:
            logging.error(
                f"Failed to get connection for {environment} environment: {str(e)}")
            return None
        except Exception as e:
            logging.error(
                f"Unexpected error getting connection for {environment} environment: {str(e)}")
            return None

    def get_environment_databases(self, environment: str) -> list:
        """Get list of databases for a specific environment"""
        conn = self.get_connection(environment)
        if not conn:
            logging.warning(
                f"Could not get connection for {environment} environment")
            return []

        cursor = None
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT `schema` FROM instance")
            databases = [row[0] for row in cursor.fetchall()]
            if environment == 'qa':
                databases.remove('do_not_delete')
            databases.append('router')
            return databases
        except Error as e:
            logging.error(
                f"Database error getting databases for {environment}: {str(e)}")
            return []
        except Exception as e:
            logging.error(
                f"Unexpected error getting databases for {environment}: {str(e)}")
            return []
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()

    def is_environment_available(self, environment: str) -> bool:
        """Check if an environment is available"""
        return environment in self.connection_pools


db_manager = DatabaseManager()
