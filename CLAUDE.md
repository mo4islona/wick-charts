## Code style

### Grouping and blank lines

Group code into logical sections with blank lines between them.
Prefer to add a blank line before return statements / breaks/ continues for readability

Good
```ts
function process(data: Data): Result {
  if (!data) return null
  
  const transformed = transform(data)
  if (transformed.isEmpty()) return null
  
  return transformed
}
```
Good
```ts
function process(data: Data): Result {
  for (const listener of this.#dataListeners) {
    listener();
  }
}
```

bad
```ts
function process(data: Data): Result {
  for (const l of this.#dataListeners) l();
}
```


## Rules

- Lint files with Biome before committing
- Not more than three arguments per function — prefer object parameters for clarity
- Don't use `!` non-null assertion operator — handle nullability explicitly
- Don't use `any` — prefer `unknown` and explicit type checks
- Don't write one-line for loops 
