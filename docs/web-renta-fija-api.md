# Web de clientes — sección "Renta fija": API que usa el CRM

El CRM (Plantillas) publica en la web de clientes las **fichas de bono** y los
**análisis de bonos** como PDF, dentro de una sección nueva **Renta fija** con
dos subsecciones:

| Subsección (pantalla)  | `category`         | Viene de (CRM)      |
|------------------------|--------------------|---------------------|
| Nuevas emisiones       | `nuevas_emisiones` | Ficha de bono       |
| Análisis de bonos      | `analisis_bonos`   | Análisis de bonos   |

Sigue el mismo patrón que **Reportes** (`/api/v1/reports`): mismo login, mismos
estados `draft`/`published`, mismo flujo de subir el PDF primero. El CRM entra
con un usuario `admin` o `director` (`get_current_admin`).

## 1. Subir el PDF

`POST /api/v1/upload/pdf?bucket=fixed-income` (multipart, campo `file`, `application/pdf`)

- Agregar `'fixed-income'` al `Literal` de `bucket` en `upload_pdf` **y** en
  `FileDeleteRequest.bucket_name`, y crear el bucket `fixed-income` (público)
  en Supabase Storage.
- Respuesta (igual que hoy): `{ "file_path": "...", "file_url": "...", "message": "..." }`

## 2. Recurso `/api/v1/fixed-income`

Modelo `FixedIncome` (tabla `fixed_income`), mismo patrón que `Report`:

| Campo            | Tipo          | Notas                                                      |
|------------------|---------------|------------------------------------------------------------|
| `id`             | UUID          | PK                                                          |
| `category`       | str           | `nuevas_emisiones` \| `analisis_bonos` (CheckConstraint)   |
| `title`          | str(255)      | obligatorio                                                |
| `description`    | text          | resumen (opcional)                                         |
| `issuer`         | str           | emisor (opcional)                                          |
| `isin`           | str           | opcional                                                   |
| `coupon`         | str           | ej. "5,125% fijo" (texto, tal cual)                        |
| `maturity`       | str           | ej. "10/09/2030" (texto, tal cual)                         |
| `price`          | str           | precio indicativo, ej. "98,75"                             |
| `yield_value`    | str           | TIR, ej. "5,60%"                                           |
| `rating`         | str           | ej. "Ba1 / BB / BB"                                        |
| `file_url`       | str(500)      | obligatorio                                                |
| `file_path`      | str(500)      | obligatorio                                                |
| `published_date` | date          | opcional                                                   |
| `status`         | str           | `draft` \| `published` (default `draft`)                   |
| `created_by`, `created_at`, `updated_at`, `published_at` | | igual que Report |

Los campos del bono son **texto libre** (vienen formateados del CRM). Pueden venir en `null`.

### Endpoints

| Método | Ruta                                   | Auth     | Qué hace |
|--------|----------------------------------------|----------|----------|
| GET    | `/api/v1/fixed-income?category=...`    | cliente  | Lista (clientes: solo `published`; admin/director: todos). Mismos filtros y paginación que reports (`skip`, `limit`). Respuesta `{ "items": [...], "total": n }` |
| GET    | `/api/v1/fixed-income/{id}`            | cliente  | Detalle |
| POST   | `/api/v1/fixed-income`                 | admin    | Crea en `draft`. Body: `category`, `title`, `file_url`, `file_path` + opcionales. **Respuesta: el objeto con `id`.** |
| PUT    | `/api/v1/fixed-income/{id}`            | admin    | Actualiza (todos los campos opcionales, incluido `file_url`/`file_path` y `category`). Respuesta: el objeto con `status`. |
| PATCH  | `/api/v1/fixed-income/{id}/publish`    | admin    | Pasa a `published` |
| DELETE | `/api/v1/fixed-income/{id}`            | admin    | Igual que reports (borra registro y archivo) |

Errores: `404` si no existe (el CRM lo usa para volver a crearlo si lo borraron a mano en la web).

## 3. Qué hace el CRM

1. Login: `POST /api/v1/auth/login` con el usuario configurado.
2. Sube el PDF a `bucket=fixed-income`.
3. Primera vez: `POST /fixed-income` + `PATCH /{id}/publish`.
   Siguientes (si se corrige el documento): `PUT /{id}` con el PDF nuevo,
   `PATCH /publish` si no estaba publicado, y borra el PDF anterior
   (`DELETE /api/v1/upload` con `bucket_name=fixed-income`).

Publicar **no** debe mandar mails a los clientes (igual que reports hoy).

## 4. Pantallas para los clientes

- Ítem **Renta fija** en el menú, con dos pestañas o subpáginas: **Nuevas emisiones** y **Análisis de bonos**.
- Cada publicación como tarjeta: título, emisor, y si hay datos: precio, TIR, cupón, vencimiento, calificación; fecha; botón para ver/descargar el PDF; favorito, igual que reportes.
