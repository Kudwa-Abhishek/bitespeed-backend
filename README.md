# Bitespeed Backend Challenge

## Live Endpoint
POST https://bitespeed-backend-u0f0.onrender.com/identify

### Request
```json
{ "email": "lorraine@hillvalley.edu", "phoneNumber": "123456" }

### Response ( first time user)
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["lorraine@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": []
  }
}

Request (same phone, new email)
{ "email": "mcfly@hillvalley.edu", "phoneNumber": "123456" }

Response (consolidated)
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [2]
  }
}

Local setup
npm install
npm run dev


Server starts at: http://localhost:3000
Health: GET / → “Bitespeed API is running. Use POST /identify”
API: POST /identify (JSON body)

Quick local test (PowerShell)
Invoke-RestMethod -Method POST -Uri "http://localhost:3000/identify" `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body '{ "email": "lorraine@hillvalley.edu", "phoneNumber": "123456" }'

.env example (no secrets)

Create a .env file locally:

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=your_local_password, (root)
DB_NAME=bitespeed