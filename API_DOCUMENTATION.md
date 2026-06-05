# TEDx Pune API Documentation

**API Version:** 1.0.0  
**Base URL:** `http://localhost:3000/api/v1`  
**Swagger UI:** `http://localhost:3000/docs`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Auth Endpoints](#auth-endpoints)
3. [Users Endpoints](#users-endpoints)
4. [Posts Endpoints](#posts-endpoints)
5. [Admin Endpoints](#admin-endpoints)
6. [Error Handling](#error-handling)
7. [Rate Limiting](#rate-limiting)

---

## Authentication

The API uses **JWT (JSON Web Token)** authentication for protected routes. 

### Getting Started with LinkedIn OAuth

1. Navigate to `/api/v1/auth/linkedin`
2. This initiates the LinkedIn OAuth flow
3. After successful authentication, you'll receive an `accessToken`
4. Include the token in the `Authorization` header for protected routes:
   ```
   Authorization: Bearer <accessToken>
   ```

---

## Auth Endpoints

### 1. Initiate LinkedIn OAuth Flow
```
GET /auth/linkedin
```

**Description:** Initiates the LinkedIn OAuth authentication flow.

**Response:** Redirects to LinkedIn login page

**Example:**
```
GET http://localhost:3000/api/v1/auth/linkedin
```

---

### 2. LinkedIn OAuth Callback
```
GET /auth/linkedin/callback
```

**Description:** Handles LinkedIn OAuth callback after user authentication.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| code | string | OAuth authorization code from LinkedIn |
| state | string | State parameter for CSRF protection |

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Status Codes:**
- `200 OK` - Successfully authenticated
- `401 Unauthorized` - Authentication failed

---

## Users Endpoints

### 1. Get Current User Profile
```
GET /users/me
```

**Authentication:** Required (Bearer Token)

**Description:** Fetch the current authenticated user's profile.

**Response:**
```json
{
  "id": "uuid",
  "fullName": "John Doe",
  "headline": "Software Engineer at TEDx",
  "avatarUrl": "https://example.com/avatar.jpg",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

**Status Codes:**
- `200 OK` - Successfully retrieved profile
- `401 Unauthorized` - Token missing or invalid

**Example cURL:**
```bash
curl -X GET http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 2. Update Current User Profile
```
PATCH /users/me
```

**Authentication:** Required (Bearer Token)

**Description:** Update the current user's profile information.

**Request Body:**
```json
{
  "fullName": "John Doe Updated",
  "headline": "Senior Software Engineer",
  "avatarUrl": "https://example.com/new-avatar.jpg"
}
```

**Fields:**
| Field | Type | Required | Max Length | Description |
|-------|------|----------|-----------|-------------|
| fullName | string | No | 100 | User's full name |
| headline | string | No | 220 | Professional headline |
| avatarUrl | string | No | - | URL to avatar image |

**Response:**
```json
{
  "id": "uuid",
  "fullName": "John Doe Updated",
  "headline": "Senior Software Engineer",
  "avatarUrl": "https://example.com/new-avatar.jpg",
  "updatedAt": "2024-01-15T10:35:00Z"
}
```

**Status Codes:**
- `200 OK` - Profile updated successfully
- `400 Bad Request` - Invalid input data
- `401 Unauthorized` - Token missing or invalid

**Example cURL:**
```bash
curl -X PATCH http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "John Doe Updated",
    "headline": "Senior Software Engineer"
  }'
```

---

### 3. Get User Directory
```
GET /users/directory
```

**Authentication:** Required (Bearer Token)

**Description:** Get paginated list of all users in your organization.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | integer | 1 | Page number (1-indexed) |
| limit | integer | 20 | Number of users per page (max: 100) |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "fullName": "Jane Smith",
      "headline": "Product Manager",
      "avatarUrl": "https://example.com/avatar1.jpg"
    },
    {
      "id": "uuid",
      "fullName": "Bob Johnson",
      "headline": "Designer",
      "avatarUrl": "https://example.com/avatar2.jpg"
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 20,
  "hasMore": true
}
```

**Status Codes:**
- `200 OK` - Successfully retrieved directory
- `401 Unauthorized` - Token missing or invalid

**Example cURL:**
```bash
curl -X GET "http://localhost:3000/api/v1/users/directory?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 4. Get User by ID
```
GET /users/:id
```

**Authentication:** Required (Bearer Token)

**Description:** Get a specific user's public profile.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | User ID |

**Response:**
```json
{
  "id": "uuid",
  "fullName": "Jane Smith",
  "headline": "Product Manager",
  "avatarUrl": "https://example.com/avatar1.jpg",
  "createdAt": "2024-01-10T14:20:00Z"
}
```

**Status Codes:**
- `200 OK` - User found
- `401 Unauthorized` - Token missing or invalid
- `404 Not Found` - User does not exist

**Example cURL:**
```bash
curl -X GET http://localhost:3000/api/v1/users/f47ac10b-58cc-4372-a567-0e02b2c3d479 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Posts Endpoints

### 1. Get Feed
```
GET /posts
```

**Authentication:** Required (Bearer Token)

**Description:** Get paginated feed of all posts in your organization.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | integer | 1 | Page number (1-indexed) |
| limit | integer | 20 | Number of posts per page (max: 100) |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "body": "Excited to announce our new initiative!",
      "author": {
        "id": "uuid",
        "fullName": "John Doe",
        "headline": "Software Engineer",
        "avatarUrl": "https://example.com/avatar.jpg"
      },
      "likesCount": 42,
      "commentsCount": 5,
      "liked": false,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 300,
  "page": 1,
  "limit": 20,
  "hasMore": true
}
```

**Status Codes:**
- `200 OK` - Successfully retrieved feed
- `401 Unauthorized` - Token missing or invalid

**Example cURL:**
```bash
curl -X GET "http://localhost:3000/api/v1/posts?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 2. Create Post
```
POST /posts
```

**Authentication:** Required (Bearer Token)

**Description:** Create a new post.

**Request Body:**
```json
{
  "body": "This is my new post about TEDx!"
}
```

**Fields:**
| Field | Type | Required | Min Length | Max Length | Description |
|-------|------|----------|-----------|-----------|-------------|
| body | string | Yes | 1 | 3000 | Post content |

**Response:**
```json
{
  "id": "uuid",
  "body": "This is my new post about TEDx!",
  "author": {
    "id": "uuid",
    "fullName": "John Doe",
    "headline": "Software Engineer",
    "avatarUrl": "https://example.com/avatar.jpg"
  },
  "likesCount": 0,
  "commentsCount": 0,
  "liked": false,
  "createdAt": "2024-01-15T11:00:00Z"
}
```

**Status Codes:**
- `201 Created` - Post created successfully
- `400 Bad Request` - Invalid input data
- `401 Unauthorized` - Token missing or invalid

**Example cURL:**
```bash
curl -X POST http://localhost:3000/api/v1/posts \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "This is my new post about TEDx!"
  }'
```

---

### 3. Delete Post
```
DELETE /posts/:id
```

**Authentication:** Required (Bearer Token)

**Description:** Delete a post (only the author or admin can delete).

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | Post ID |

**Response:**
```json
{
  "success": true,
  "message": "Post deleted successfully"
}
```

**Status Codes:**
- `200 OK` - Post deleted successfully
- `401 Unauthorized` - Token missing or invalid
- `403 Forbidden` - You don't have permission to delete this post
- `404 Not Found` - Post does not exist

**Example cURL:**
```bash
curl -X DELETE http://localhost:3000/api/v1/posts/f47ac10b-58cc-4372-a567-0e02b2c3d479 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 4. Toggle Like on Post
```
POST /posts/:id/like
```

**Authentication:** Required (Bearer Token)

**Description:** Like or unlike a post.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | Post ID |

**Response:**
```json
{
  "id": "uuid",
  "liked": true,
  "likesCount": 43
}
```

**Status Codes:**
- `200 OK` - Like toggled successfully
- `401 Unauthorized` - Token missing or invalid
- `404 Not Found` - Post does not exist

**Example cURL:**
```bash
curl -X POST http://localhost:3000/api/v1/posts/f47ac10b-58cc-4372-a567-0e02b2c3d479/like \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 5. Get Comments on Post
```
GET /posts/:id/comments
```

**Authentication:** Required (Bearer Token)

**Description:** Get all comments on a post.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | Post ID |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "body": "Great post!",
      "author": {
        "id": "uuid",
        "fullName": "Jane Smith",
        "headline": "Product Manager",
        "avatarUrl": "https://example.com/avatar1.jpg"
      },
      "parentId": null,
      "replies": [
        {
          "id": "uuid",
          "body": "Thanks for the reply!",
          "author": {
            "id": "uuid",
            "fullName": "John Doe",
            "headline": "Software Engineer",
            "avatarUrl": "https://example.com/avatar.jpg"
          },
          "parentId": "uuid",
          "createdAt": "2024-01-15T11:05:00Z"
        }
      ],
      "createdAt": "2024-01-15T11:00:00Z"
    }
  ],
  "total": 5
}
```

**Status Codes:**
- `200 OK` - Successfully retrieved comments
- `401 Unauthorized` - Token missing or invalid
- `404 Not Found` - Post does not exist

**Example cURL:**
```bash
curl -X GET http://localhost:3000/api/v1/posts/f47ac10b-58cc-4372-a567-0e02b2c3d479/comments \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 6. Create Comment
```
POST /posts/:id/comments
```

**Authentication:** Required (Bearer Token)

**Description:** Add a comment to a post. Comments can have replies (max depth: 1).

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | Post ID |

**Request Body:**
```json
{
  "body": "Great post! Really insightful.",
  "parentId": null
}
```

**Fields:**
| Field | Type | Required | Min Length | Max Length | Description |
|-------|------|----------|-----------|-----------|-------------|
| body | string | Yes | 1 | 1000 | Comment content |
| parentId | string (UUID) | No | - | - | Parent comment ID for replies (depth max: 1) |

**Response:**
```json
{
  "id": "uuid",
  "body": "Great post! Really insightful.",
  "author": {
    "id": "uuid",
    "fullName": "Jane Smith",
    "headline": "Product Manager",
    "avatarUrl": "https://example.com/avatar1.jpg"
  },
  "parentId": null,
  "createdAt": "2024-01-15T11:15:00Z"
}
```

**Status Codes:**
- `201 Created` - Comment created successfully
- `400 Bad Request` - Invalid input data
- `401 Unauthorized` - Token missing or invalid
- `404 Not Found` - Post or parent comment does not exist

**Example cURL (Top-level comment):**
```bash
curl -X POST http://localhost:3000/api/v1/posts/f47ac10b-58cc-4372-a567-0e02b2c3d479/comments \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "Great post! Really insightful."
  }'
```

**Example cURL (Reply to comment):**
```bash
curl -X POST http://localhost:3000/api/v1/posts/f47ac10b-58cc-4372-a567-0e02b2c3d479/comments \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "Thanks for your comment!",
    "parentId": "parent-comment-uuid"
  }'
```

---

## Admin Endpoints

**Authentication:** Required (Bearer Token)  
**Authorization:** Admin or Super Admin role required

### 1. Get Dashboard Metrics
```
GET /admin/metrics
```

**Description:** Get dashboard metrics and statistics for the organization.

**Response:**
```json
{
  "totalUsers": 250,
  "activeUsers": 185,
  "totalPosts": 1250,
  "averageEngagement": 12.5,
  "pendingApprovals": 15,
  "blockedUsers": 3
}
```

**Status Codes:**
- `200 OK` - Successfully retrieved metrics
- `401 Unauthorized` - Token missing or invalid
- `403 Forbidden` - Admin role required

**Example cURL:**
```bash
curl -X GET http://localhost:3000/api/v1/admin/metrics \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

### 2. List Pending Users
```
GET /admin/users/pending
```

**Description:** Get list of users pending approval.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "fullName": "New User",
      "email": "newuser@example.com",
      "headline": "Looking to learn",
      "status": "pending",
      "createdAt": "2024-01-14T15:30:00Z"
    }
  ],
  "total": 15
}
```

**Status Codes:**
- `200 OK` - Successfully retrieved pending users
- `401 Unauthorized` - Token missing or invalid
- `403 Forbidden` - Admin role required

**Example cURL:**
```bash
curl -X GET http://localhost:3000/api/v1/admin/users/pending \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

### 3. Approve User
```
PATCH /admin/users/:id/approve
```

**Description:** Approve a pending user.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | User ID |

**Response:**
```json
{
  "id": "uuid",
  "fullName": "New User",
  "status": "approved",
  "approvedAt": "2024-01-15T12:00:00Z"
}
```

**Status Codes:**
- `200 OK` - User approved successfully
- `401 Unauthorized` - Token missing or invalid
- `403 Forbidden` - Admin role required
- `404 Not Found` - User does not exist

**Example cURL:**
```bash
curl -X PATCH http://localhost:3000/api/v1/admin/users/f47ac10b-58cc-4372-a567-0e02b2c3d479/approve \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

### 4. Block User
```
PATCH /admin/users/:id/block
```

**Description:** Block a user from the platform.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | User ID |

**Response:**
```json
{
  "id": "uuid",
  "fullName": "Blocked User",
  "status": "blocked",
  "blockedAt": "2024-01-15T12:05:00Z"
}
```

**Status Codes:**
- `200 OK` - User blocked successfully
- `401 Unauthorized` - Token missing or invalid
- `403 Forbidden` - Admin role required
- `404 Not Found` - User does not exist

**Example cURL:**
```bash
curl -X PATCH http://localhost:3000/api/v1/admin/users/f47ac10b-58cc-4372-a567-0e02b2c3d479/block \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

### 5. Delete Post (Admin)
```
DELETE /admin/posts/:id
```

**Description:** Delete a post as an admin.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | Post ID |

**Response:**
```json
{
  "success": true,
  "message": "Post deleted successfully by admin"
}
```

**Status Codes:**
- `200 OK` - Post deleted successfully
- `401 Unauthorized` - Token missing or invalid
- `403 Forbidden` - Admin role required
- `404 Not Found` - Post does not exist

**Example cURL:**
```bash
curl -X DELETE http://localhost:3000/api/v1/admin/posts/f47ac10b-58cc-4372-a567-0e02b2c3d479 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## Error Handling

The API returns standardized error responses:

### Error Response Format
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": [
    {
      "field": "body",
      "constraints": {
        "isString": "body must be a string",
        "minLength": "body must be longer than or equal to 1 characters"
      }
    }
  ]
}
```

### Common Error Codes

| Status Code | Meaning |
|------------|---------|
| 400 | Bad Request - Invalid input data |
| 401 | Unauthorized - Missing or invalid token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource does not exist |
| 422 | Unprocessable Entity - Validation error |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |

---

## Rate Limiting

The API implements rate limiting to protect against abuse:

- **Rate Limit:** 60 requests per 60 seconds (1 minute)
- **Per User:** Rate limiting is applied globally per IP address

### Rate Limit Headers

Response headers include rate limit information:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 55
X-RateLimit-Reset: 1610704800
```

When limit is exceeded, the API returns:
```
HTTP/1.1 429 Too Many Requests
Retry-After: 30
```

---

## Common Use Cases

### Complete User Authentication Flow

1. **Redirect user to LinkedIn OAuth:**
   ```
   GET /api/v1/auth/linkedin
   ```

2. **Receive token from callback:**
   ```
   Response: { "accessToken": "..." }
   ```

3. **Store token (locally/sessionStorage/Redux):**
   ```javascript
   localStorage.setItem('token', accessToken);
   ```

4. **Use token for authenticated requests:**
   ```javascript
   fetch('http://localhost:3000/api/v1/users/me', {
     headers: {
       'Authorization': `Bearer ${accessToken}`
     }
   })
   ```

### Create and Manage Posts

1. **Create a post:**
   ```
   POST /posts
   { "body": "My new TEDx post!" }
   ```

2. **Get feed:**
   ```
   GET /posts?page=1&limit=20
   ```

3. **Like a post:**
   ```
   POST /posts/{postId}/like
   ```

4. **Add a comment:**
   ```
   POST /posts/{postId}/comments
   { "body": "Great post!" }
   ```

---

## Testing

### Using cURL

All examples in this documentation use cURL. Replace:
- `YOUR_TOKEN` with your actual JWT token
- `YOUR_ADMIN_TOKEN` with an admin user's JWT token
- UUIDs with actual resource IDs

### Using Postman

1. Import the Swagger spec from `http://localhost:3000/docs`
2. Set authorization header in Postman for all requests
3. Use environment variables for base URL and token

### Using Swagger UI

Visit `http://localhost:3000/docs` to interact with the API directly through the browser.

---

## Support & Troubleshooting

### Common Issues

**401 Unauthorized:**
- Token is missing or expired
- Use the LinkedIn OAuth flow to get a new token

**403 Forbidden:**
- You don't have permission for this resource
- Contact admin if you need elevated permissions

**404 Not Found:**
- Resource doesn't exist
- Check the resource ID is correct

**400 Bad Request:**
- Check request payload matches the schema
- Verify required fields are provided

---

**Last Updated:** January 2024  
**Next Update:** Will be updated as new endpoints are added
