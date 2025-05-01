# Database Change Tracker

A FastAPI-based application for managing and tracking database changes across multiple environments (QA, Production, Enterprise). The application provides a secure API for executing SQL changes, managing pending changes, and viewing change history.

## Features

- Multi-environment database management (QA, Production, Enterprise)
- Secure authentication system with Basic Auth
- SQL change tracking and version control
- Change promotion between environments
- Detailed logging system
- Database connection pooling
- Multi-tenant database support

## Prerequisites

- Python 3.7+
- MySQL Server
- pip (Python package manager)

## Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd database-migrator
   ```

2. Install required dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Create a `.env` file in the root directory with the following variables:

```plaintext
# Authentication
APP_USERNAME=admin
APP_PASSWORD=password

# Router Database Configuration
ROUTER_DB_HOST=your_router_host
ROUTER_DB_PORT=your_router_port
ROUTER_DB_USER=your_router_user
ROUTER_DB_PASSWORD=your_router_password

# Environment-specific Database Configuration
QA_DB_HOST=your_qa_host
QA_DB_PORT=your_qa_port
QA_DB_USER=your_qa_user
QA_DB_PASSWORD=your_qa_password

PRODUCTION_DB_HOST=your_production_host
PRODUCTION_DB_PORT=your_production_port
PRODUCTION_DB_USER=your_prod_user
PRODUCTION_DB_PASSWORD=your_prod_password

ENTERPRISE_DB_HOST=your_enterprise_host
ENTERPRISE_DB_PORT=your_enterprise_port
ENTERPRISE_DB_USER=your_enterprise_user
ENTERPRISE_DB_PASSWORD=your_enterprise_password
```

## Directory Structure

```markdown
database-migrator/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── routes.py
│   │   ├── main.py
│   │   └── ... (other modules)
├── frontend/
│   └── ... (frontend files)
├── db_changes/
│   ├── qa/
│   ├── production/
│   └── enterprise/
├── .env
├── requirements.txt
└── app.log
```

## Usage

1. Start the backend API server:

   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```

2. Access the API documentation through your web browser at:
   - Swagger UI: `http://localhost:8000/docs`
   - ReDoc: `http://localhost:8000/redoc`

3. Authenticate using the credentials specified in your `.env` file:
   - Username: admin
   - Password: password

## Environment Flow

The application follows a specific promotion path for changes:

```markdown
QA -> Production -> Enterprise
```

Changes must be applied in QA first before they can be promoted to Production, and similarly from Production to Enterprise.

## API Endpoints

### 1. Database Change Management

- Execute SQL queries against selected databases
- Track changes with unique change IDs
- Automatic version control of SQL scripts

### 2. Pending Changes

- View changes ready for promotion from previous environment
- Select and apply pending changes
- Preview SQL content before application

### 3. Change History

- Historical view of all changes in current environment
- Filter changes by date range
- Preview SQL content of past changes

## Logging

The application maintains detailed logs in `app.log` for tracking operations and errors.

## Security Features

- Basic authentication
- Environment-specific database credentials
- Input validation and sanitization
- Exception handling
- Connection pooling with timeout handling

## Available Environments

- QA: (your_qa_host)
- Production: (your_production_host)
- Enterprise: (your_enterprise_host)

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

GNU GENERAL PUBLIC LICENSE
