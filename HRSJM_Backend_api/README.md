# HRSJM Backend API

Backend API for the HRSJM NGO membership management system.

## Tech stack

- Node.js + Express
- MongoDB + Mongoose
- JWT authentication (added later)

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

`MONGO_URI` — connection string for your MongoDB database:

- **Atlas (cloud, easiest):** create a free cluster at https://www.mongodb.com/atlas, get the connection string, and use it here.
- **Local:** install MongoDB Community Server, then use `mongodb://127.0.0.1:27017/hrsjm`.

### 3. Run the server

```bash
npm run dev
```

You should see:

```
MongoDB connected
Server running on http://localhost:5000
```

### 4. Test it

Open http://localhost:5000/api/health in a browser or Postman. Expected response:

```json
{ "status": "ok", "service": "HRSJM Backend API" }
```

## Project structure

```
src/
├── config/          # database connection
│   └── db.js
├── controllers/     # request handlers (added as features grow)
├── models/          # Mongoose schemas (added as features grow)
├── middleware/      # auth, validation, error handling (added later)
├── routes/          # URL definitions
│   └── health.routes.js
├── app.js           # express app setup
└── server.js        # entry point: loads env, connects DB, starts server
```

## Git workflow

Commit small and often:

```bash
git add .
git commit -m "describe what you just did"
```
