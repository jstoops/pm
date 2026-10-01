# AI Board Response Schema

## Request Context

`POST /api/chat` accepts the authenticated user's `message` and up to 12 prior `history` messages. The backend sends OpenRouter a JSON context containing that history, the user's question, and the current authenticated board JSON. The client cannot select a board or supply board state for persistence.

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

`operations` is optional and supports at most 20 entries. Each operation uses numeric IDs from the current board. Titles are trimmed and must not be blank. `position` is the zero-based index the card takes in the target column. The operation models live in `backend/app/operations.py` and are the same ones the REST board routes use:

- `rename_column`: `columnId`, `title`
- `create_card`: `columnId`, `title`, optional `details`
- `update_card`: `cardId`, `title` and/or `details`
- `move_card`: `cardId`, `columnId`, `position`
- `delete_card`: `cardId`

The backend validates the complete output before writing. It applies all valid operations in one SQLite transaction through the board service. A malformed response, unknown operation, or card or column outside the authenticated user's board returns an error and leaves the board unchanged.