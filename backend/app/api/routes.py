from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict
from app.models.sql_change import (
    SQLChange, SQLChangeCreate, SQLChangeUpdate, SQLResponse,
    SQLAlterationCreate
)
from app.services.sql_change_service import sql_change_service
from app.db.database import db_manager
from app.core.auth import verify_credentials

router = APIRouter()


@router.post("/changes", response_model=SQLChange)
async def create_change(
    change_data: SQLChangeCreate,
    username: str = Depends(verify_credentials)
):
    """Create a new SQL change with optional rollback SQL"""
    if not db_manager.is_environment_available(change_data.environment):
        raise HTTPException(
            status_code=400,
            detail=f"Environment {change_data.environment} is not available"
        )
    try:
        change_data.created_by = username
        return sql_change_service.create_change(change_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/changes/{change_id}/alter", response_model=SQLChange)
async def alter_change(
    change_id: str,
    environment: str,
    alteration_data: SQLAlterationCreate,
    username: str = Depends(verify_credentials)
):
    """Alter an existing SQL change"""
    if not db_manager.is_environment_available(environment):
        raise HTTPException(
            status_code=400,
            detail=f"Environment {environment} is not available"
        )
    try:
        alteration_data.altered_by = username
        return sql_change_service.add_alteration(change_id, environment, alteration_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/changes/{environment}", response_model=List[SQLChange])
async def get_changes(
    environment: str,
    username: str = Depends(verify_credentials)
):
    """Get all changes for an environment"""
    if not db_manager.is_environment_available(environment):
        raise HTTPException(
            status_code=400,
            detail=f"Environment {environment} is not available"
        )
    try:
        return sql_change_service.get_all_changes(environment)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/changes/{environment}/pending", response_model=List[SQLChange])
async def get_pending_changes(
    environment: str,
    username: str = Depends(verify_credentials)
):
    """Get pending changes for an environment"""
    if not db_manager.is_environment_available(environment):
        raise HTTPException(
            status_code=400,
            detail=f"Environment {environment} is not available"
        )
    try:
        return sql_change_service.get_pending_changes(environment)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/changes/{change_id}/apply/{environment}")
async def apply_change(
    change_id: str,
    environment: str,
    target_databases: List[str] = None,
    username: str = Depends(verify_credentials)
):
    """Apply a change to an environment"""
    if not db_manager.is_environment_available(environment):
        raise HTTPException(
            status_code=400,
            detail=f"Environment {environment} is not available"
        )
    try:
        return sql_change_service.apply_change(change_id, environment, target_databases)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/changes/{change_id}/rollback/{environment}")
async def rollback_change(
    change_id: str,
    environment: str,
    username: str = Depends(verify_credentials)
):
    """Rollback a change in an environment"""
    if not db_manager.is_environment_available(environment):
        raise HTTPException(
            status_code=400,
            detail=f"Environment {environment} is not available"
        )
    try:
        return sql_change_service.rollback_change(change_id, environment)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/databases/{environment}", response_model=List[str])
async def get_databases(
    environment: str,
    username: str = Depends(verify_credentials)
):
    """Get list of databases for an environment"""
    if not db_manager.is_environment_available(environment):
        raise HTTPException(
            status_code=400,
            detail=f"Environment {environment} is not available"
        )
    try:
        databases = db_manager.get_environment_databases(environment)
        if not databases:
            raise HTTPException(
                status_code=400,
                detail=f"Could not retrieve databases for environment {environment}"
            )
        return databases
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/environments/status", response_model=Dict[str, bool])
async def get_environment_status(username: str = Depends(verify_credentials)):
    """Get status of all environments"""
    return {
        "qa": db_manager.is_environment_available("qa"),
        "production": db_manager.is_environment_available("production"),
        "enterprise": db_manager.is_environment_available("enterprise")
    }
