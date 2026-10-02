# AI Board Response Schema

## Request Context

`POST /api/boards/{boardId}/chat` accepts the authenticated user's `message` and up to 12 prior `history` messages. The backend sends OpenRouter a JSON context containing that history, the user's question, and the current board JSON. The board must belong to the signed-in user (otherwise 404); the client cannot supply board state for persistence.

## Model Output

The request sets OpenRouter's `response_format` to a JSON schema generated from the `AIOutput` model, and the system prompt repeats the shape. The model must return JSON only, using this versioned shape:

```json
{
  "version": 1,
  "assistantText": "I added the task to Backlog.",
  "operations": [
    {
      "type": "create_card",
      "columnId": 1,
      "title": "Review analytics requirements",
      "details": "Collect reporting needs from the team."
    }
  ]
}
```

`operations` is optional and supports at most 20 entries. Each operation uses numeric IDs from the current board. Titles and board names are trimmed and must not be blank. `position` is the zero-based index the card or column takes after the move. The operation models live in `backend/app/operations.py` and are the same ones the REST board routes use:

- `update_board`: `name` and/or `description`
- `create_column`: `title` (added at the end)
- `rename_column`: `columnId`, `title`
- `move_column`: `columnId`, `position`
- `delete_column`: `columnId` (also deletes its cards)
- `create_card`: `columnId`, `title`, optional `details`
- `update_card`: `cardId`, `title` and/or `details`
- `move_card`: `cardId`, `columnId`, `position`
- `delete_card`: `cardId`

The backend validates the complete output before writing. It applies all valid operations to the requested board in one SQLite transaction through the board service. A malformed response, unknown operation, or card or column outside that board returns 502 and leaves the board unchanged.
