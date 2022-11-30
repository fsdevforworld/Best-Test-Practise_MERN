# How do API errors get handled?

First, we hoist some uniform error classes into global namespace.

```javascript
// index.js
const error = require('./middleware/error');
error.register();
```
Next, we register error-handling middleware.

```javascript
// index.js
const express = require('express');
const app = express();
// ... register other middleware / route handlers 
// register error-handling middleware last!
app.use(error.middleware);
```

This will allow you to use pre-defined error classes anywhere in the app. For example:

```javascript
// some-route-handler.js
function put(req, res, next){
  const fieldset = Object.assign({}, req.body);
  if (!fieldset) {
    return next(new InvalidParametersError('At least one field to update is required'));
  }
  // ... etc
}
```

# Error Method Signatures

All errors below subclass `BaseApiError`. 

| Method Signatures & Default Options    | Meaning          |
| ------------- |:-------------:|
| `NotFoundError('<optional message>', {statusCode: 404})`    | Couldn't find the entity |
| `AlreadyExistsError('<optional message>', {statusCode: 409})`      | The entity tried to create already exists     | 
| `InvalidCredentialsError('<optional message>', {statusCode: 403})`    | The provided login token didn't match the one in our database |
| `UnauthorizedError('<optional message>', {statusCode: 401})`    | Client tried to access a route that requires authentication without being authenticated |
| `MissingHeadersError('<optional message>', {statusCode: 400, required: [...], provided: [...]})`    | Client is missing required headers. If an array of both required and client-provided headers is provided, the client will receive a message specifying which headers they're missing. |
| `InvalidParametersError('<optional message>', {statusCode: 400, required: [...], provided: [...]})`    | Client is missing required parameters. If an array of both required and client-provided parameters is provided, the client will receive a message specifying which parameters they're missing. |
| `ApiError('<optional message>', {statusCode: <code>, name: <name>})`    | Roll your own error, providing the error name, HTTP status code, and message |

# Errors in the Wild

The following table is meant to help demystify errors encounted by clients.

| Type   | Code          | Meaning |
| ------------- |:-------------:|:-------------:|
| `not_found` | 404 | Entity not found |
| `already_exists` | 409 | An entity already exists with a unique identifier (like phone number) |
| `invalid_token` | 403 | Invalid Authentization token was provided |
| `invalid_code` | 403 | Invalid 2-factor authentication code was provided |
| `invalid_parameters` | 400 | Some required parameters were not provided |
| `invalid_headers` | 400 | Some required headers were not provided |
| `internal_error` | 500 | Uncaught application exception. Error stack is logged with Stackdriver|


