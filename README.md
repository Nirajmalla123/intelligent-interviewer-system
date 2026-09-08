# AI-powered video interview assesment system

Project

Build a production-ready AI-Powered Intelligent Video Interview Assessment System Using Deep Learning, Computer Vision, Speech Processing, and Large Language Models.

The system should simulate an intelligent interviewer that asks interview questions, records candidate video answers, analyzes the answers using multiple AI modules running in parallel, generates follow-up questions, scores the candidate, and produces a recruiter report.

The project must be modular, scalable, cleanly architected, and follow SOLID principles.

Tech Stack

Backend

Python 3.13+

FastAPI

SQLAlchemy 2.x (ORM)

Alembic

PostgreSQL

Pydantic v2

JWT Authentication

Refresh Token Authentication

Passlib (bcrypt)

python-jose

Redis (background jobs & caching)

Celery (or FastAPI Background Tasks initially)

Cloudinary (video storage)

Uvicorn

python-dotenv

AI Libraries

Speech-to-Text

Faster-Whisper

Computer Vision

OpenCV

MediaPipe

Emotion Detection

DeepFace

Voice Analysis

Librosa

LLM Evaluation

Support multiple providers.

Primary:

OpenAI GPT

Secondary:

Ollama (Llama)

Evaluation includes:

semantic understanding

technical correctness

communication quality

follow-up question generation

Frontend

React 19

TypeScript

Vite

React Router

Axios

React Hook Form

Zod

Tailwind CSS

ShadCN UI

Framer Motion

Storage

Database

PostgreSQL

Video Storage

Cloudinary

Temporary Files

Local uploads

Backend Architecture

Use Clean Architecture.

backend/

app/

api/
core/
models/
schemas/
repositories/
services/
dependencies/
middleware/
utils/
workers/
ai/
main.py


Never place business logic inside API routes.

API routes should only:

validate request

call services

return response

All database operations belong inside repositories.

Business logic belongs inside services.

AI modules belong inside app/ai.

Folder Structure

backend/

app/

api/
auth.py
interviews.py
answers.py
reports.py
questions.py
profile.py

core/
config.py
database.py
security.py

models/

schemas/

repositories/

services/

dependencies/

middleware/

utils/

workers/

ai/

speech/
vision/
emotion/
voice/
llm/

main.py


Authentication

Implement

Registration

Login

Refresh Token

Logout

Current User

Password hashing

JWT

Role-based authorization

Roles

Candidate

Admin

Login flow

Candidate

↓

POST /auth/login

↓

Verify Password

↓

Generate Access Token

↓

Generate Refresh Token

↓

Return Tokens


Interview Workflow

Candidate Login

↓

Start Interview

↓

AI asks Question

↓

Candidate records answer

↓

Recording finishes

↓

Upload video

↓

Store video

↓

Create Answer

↓

Run AI analysis in parallel

Speech

Vision

Emotion

Voice

LLM

↓

Store AI results

↓

Generate Follow-up Question

↓

Return Question

↓

Repeat

↓

Interview Complete

↓

Generate Report

↓

Recruiter Dashboard


Backend Flow

POST /answers/upload

↓

Save metadata

↓

Upload video to Cloudinary

↓

Create Answer record

↓

Run AI modules in parallel

Speech Service

Vision Service

Emotion Service

Voice Service

LLM Service

↓

Store analysis

↓

Generate follow-up

↓

Return response


AI Pipeline

Speech

Use Faster Whisper

Return

Transcript

Confidence

Language

Speech duration

Vision

Use OpenCV + MediaPipe

Analyze

Face detection

Eye contact

Head pose

Blink rate

Facial landmarks

Emotion

Use DeepFace

Detect

Happy

Sad

Neutral

Fear

Angry

Surprise

Dominant emotion

Voice

Use Librosa

Analyze

Pitch

Energy

Speech rate

Pause count

Voice confidence

Volume

LLM

Input

Question

Resume

Transcript

Job role

Interview history

Output

Answer evaluation

Technical score

Communication score

Strengths

Weaknesses

Follow-up question

AI Orchestrator

Create one orchestration service.

Responsibilities

Receive uploaded answer

Trigger every AI service concurrently

Collect outputs

Store outputs

Calculate scores

Generate follow-up

Return results

Do NOT place orchestration logic inside API routes.

Database

Use PostgreSQL.

Tables

Users

Candidate Profiles

Resumes

Interviews

Questions

Candidate Answers

Speech Analysis

Face Analysis

Emotion Analysis

Voice Analysis

LLM Evaluation

Interview Scores

Follow-up Questions

Reports

Relationships

Interview

↓

Questions

↓

Candidate Answers

↓

Speech

Face

Emotion

Voice

LLM

↓

Interview Scores

↓

Report


Each AI module owns its own table.

Do not merge all AI outputs into one table.

Repository Layer

Repositories perform

CRUD

Filtering

Pagination

Search

No business logic.

Service Layer

Services perform

Validation

Workflow

Business rules

Repository coordination

AI orchestration

API Endpoints

Authentication

POST /auth/register

POST /auth/login

POST /auth/refresh

POST /auth/logout

GET /auth/me


Candidate

GET /profile

PUT /profile

POST /resume/upload

DELETE /resume


Interview

POST /interviews/start

GET /interviews

GET /interviews/{id}

PUT /interviews/{id}/complete


Questions

POST /questions

GET /questions/interview/{id}

GET /questions/{id}


Answers

POST /answers/upload

GET /answers/interview/{id}


Reports

GET /reports/{id}


Admin

GET /admin/dashboard


Report Generation

Generate

Overall Score

Communication Score

Technical Score

Confidence Score

Emotion Score

Eye Contact Score

Voice Score

Grammar Score

Strengths

Weaknesses

AI Recommendation

PDF

Charts

Coding Standards

Always

Type hints

Async endpoints

Dependency injection

Repository pattern

Service pattern

SOLID principles

PEP8

Meaningful variable names

Reusable utilities

Proper exception handling

Logging

Validation

Configuration via environment variables

Never hardcode secrets.

Performance

Run AI modules concurrently.

Use async where appropriate.

Use background workers for long-running tasks.

Optimize database queries.

Avoid duplicate processing.

Error Handling

Every endpoint should return

Proper HTTP status codes

Structured JSON errors

Validation messages

Logging

Security

JWT Authentication

Refresh Tokens

Password hashing

Role authorization

CORS

Rate limiting

Environment variables

Secure file upload validation

Testing

Include

Unit tests

Integration tests

API tests

Authentication tests

Repository tests

Service tests

AI pipeline tests (mock AI models)

Scalability

The architecture should allow replacing

Whisper

DeepFace

LLM provider

Cloudinary

without changing the business logic.

Use interfaces or abstraction layers for AI providers.

Development Rules

Build the project incrementally, one module at a time.

Generate complete production-ready code; do not use placeholders or pseudo-code.

Keep business logic out of controllers/routes.

Follow the exact folder structure and architecture defined above.

Ensure all components are modular, reusable, and maintainable.

Maintain consistency with the specified database schema and workflow.

Every feature must include models, schemas, repositories, services, API routes, validation, error handling, and tests before moving to the next feature.

The final system must support the complete interview lifecycle: authentication → interview → AI analysis → follow-up generation → scoring → reporting.


## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
