# ROBLE CRM — normas de trabajo

## Ambientes y ramas

| Rama      | Ambiente    | Deploy (Railway)                 |
|-----------|-------------|----------------------------------|
| `main`    | Producción  | environment `production`         |
| `develop` | Desarrollo  | environment `development`        |

Reglas:

1. **Nunca** commitear ni pushear directo a `main`.
2. Todo cambio se hace en `develop` (o en una rama que sale de `develop` y vuelve a `develop`). Los worktrees `claude/*` se crean a partir de `develop`.
3. Al terminar un cambio: commitear y pushear a `develop` automáticamente, sin pedir confirmación primero → Railway deploya el ambiente de desarrollo → se testea ahí.
4. Solo cuando el cambio anda bien en desarrollo y Francisco lo confirma, se mergea `develop` → `main`, lo que deploya producción.
5. Las migraciones de esquema (`*_migration.sql`) se aplican primero a la DB de desarrollo y a producción recién al mergear a `main`.
6. No mergear a `main` ni tocar producción sin pedido/confirmación explícita.
