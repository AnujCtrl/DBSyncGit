from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.routes import router
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="Database Change Tracker",
    description="""
    API for tracking and applying database changes across environments (QA, Production, Enterprise).
    
    ## Authentication
    All endpoints require Basic Authentication using the following credentials:
    - Username: admin
    - Password: password
    
    ## Environments
    - QA: (your_qa_host)
    - Production: (your_production_host)
    - Enterprise: (your_enterprise_host)
    
    ## Workflow
    1. Create changes in QA environment
    2. Apply changes to QA databases
    3. View pending changes in Production
    4. Apply changes to Production databases
    5. View pending changes in Enterprise
    6. Apply changes to Enterprise databases
    """,
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "message": "Database Change Tracker API",
        "documentation": "/docs",
        "redoc": "/redoc"
    }


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"detail": f"An unexpected error occurred: {str(exc)}"}
    )
