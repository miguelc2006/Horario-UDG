# 📅 Planeador de Horarios UDG: Consulta Académica y Gestión de Carga

## I. Introducción y Propósito del Proyecto

Esta herramienta fue desarrollada con el propósito fundamental de simplificar el proceso de planificación semestral para la comunidad estudiantil de la Universidad de Guadalajara. El *Planeador de Horarios UDG* es una aplicación web que automatiza y simplifica la consulta de la oferta académica, permitiendo la construcción visual de un horario personalizado y detectando conflictos de tiempo de manera eficiente.

Mi objetivo al desarrollar este proyecto es Facilitar la consulta de la oferta academica mediante una herramienta ágil que facilite la toma de decisiones informadas sobre la carga académica.

---

## II. Características

El proyecto se distingue por las siguientes funcionalidades clave, que aseguran una experiencia de planificación robusta:

* **Consulta Directa a SIIAU:** Extrae y procesa la oferta académica (materias y NRCs) en tiempo real. Para lograrlo, he implementado funciones *serverless* que interactúan con la fuente de datos oficial.
* **Selección Modular de Materias:** Permite la búsqueda y adición dinámica de materias, facilitando la elección del Número de Referencia del Curso (**NRC**) adecuado para cada asignatura.
* **Detección de Cruces de Horario:** Implementa una lógica precisa para identificar y notificar cualquier superposición de sesiones entre los NRCs seleccionados. Las clases con conflicto se resaltan visualmente en el horario final.
* **Visualización Detallada del Horario:** Genera una representación gráfica e intuitiva del horario, con soporte para dos temas visuales: **Claro** y **Oscuro**.
* **Exportación Profesional:** Ofrece la capacidad de exportar el horario generado en formatos **PDF** (útil para registros) y **JPEG** (ideal para fondos de pantalla o compartir en redes sociales).
* **Persistencia de Sesión:** Guarda el estado de la consulta y la selección de materias en `sessionStorage`, permitiendo al usuario recargar la página sin perder su progreso.
* **Cuenta y perfil:** Incluye un panel para consultar el estado de la cuenta, administrar preferencias, exportar datos y eliminar la propia cuenta.
* **Acceso por perfiles:** Cualquier cuenta Google puede iniciar sesión y usar consulta y planificación local. Alumnos y académicos reciben capacidades persistentes diferentes derivadas de su dominio institucional.
* **Auditoría de cuentas:** El primer inicio de sesión y la eliminación de identidad generan eventos server-side pseudonimizados, sin almacenar UID, nombre ni correo completo en la bitácora.
* **Monitoreo de oferta:** Los perfiles institucionales pueden asociar materias a un dispositivo para recibir avisos de cambios y disponibilidad, identificando cada monitoreo por la combinación estable **NRC + ciclo**.

### 2.1. Autenticación y autorización

La autenticación con Google está separada de la autorización de datos:

| Tipo de perfil | Dominio | Capacidades |
| :--- | :--- | :--- |
| **Alumno UDG** | `@alumnos.udg.mx` | Horarios cloud, evaluaciones, monitoreo/notificaciones y caché de profesores |
| **Académico UDG** | `@academicos.udg.mx` | Evaluaciones, monitoreo/notificaciones y caché de profesores; sin horarios cloud |
| **Externo** | Otro dominio | Consulta pública y planificación local |

* El cliente usa capacidades explícitas y conserva `isAuthorized` únicamente como alias compatible de horarios cloud.
* Los endpoints serverless verifican el ID token y vuelven a aplicar la política porque Firebase Admin omite Firestore Rules.
* `POST /api/account-profile` sincroniza el perfil interno y crea `account_registered` una sola vez mediante una transacción.
* `DELETE /api/delete-account` exige autenticación reciente, elimina la identidad con Firebase Admin y confirma `account_deleted`.
* Los eventos de auditoría usan HMAC-SHA256 y no guardan UID, nombre ni correo completo. El perfil operativo interno sí se asocia temporalmente al UID y se elimina junto con la cuenta.
* La limpieza de datos accesibles al cliente se ejecuta como mejor esfuerzo antes de eliminar la identidad.

La política está documentada en [`firebase_rules.md`](./firebase_rules.md) y su fuente final revisable está en [`firebase.rules`](./firebase.rules). El repositorio no la despliega automáticamente; debe revisarse y publicarse manualmente en Firebase Console.

### 2.2. Notificaciones y monitoreo

El frontend mantiene una sola fuente de verdad mediante `NotificationsProvider`. Los componentes no deben inferir que las notificaciones están completamente activadas únicamente porque el navegador concedió permiso. El flujo completo es:

1. `Notification.permission` confirma el permiso real del origen.
2. Firebase Messaging recupera un token FCM para el navegador y dispositivo actuales.
3. `POST /api/fcm-register` confirma que el token quedó asociado a la cuenta autenticada.
4. El usuario activa uno o más monitoreos persistidos, identificados por **NRC + ciclo**.

El proveedor rehidrata esos estados al iniciar sesión, recargar la página, recuperar foco, volver a una pestaña visible o restaurar una página. El permiso no se simula con `localStorage`: `localhost`, otros puertos y el dominio de producción son orígenes distintos y conservan permisos independientes.

Las operaciones de `/api/toggle-monitor` son idempotentes y sincronizan transaccionalmente el monitoreo del usuario con `monitoring-queue`. `horarioLabel` se conserva solo como texto de presentación; no sustituye al ciclo ni forma parte de la identidad de dominio.

El cron configurado actualmente en `vercel.json` usa `0 8 * * 1-6`: se ejecuta a las 08:00 UTC de lunes a sábado. No debe anunciarse como una revisión cada quince minutos salvo que se cambie explícitamente la programación y el plan de despliegue lo permita.

---

## III. Estructura y Tecnologías Empleadas

La arquitectura del proyecto se divide en un *frontend* interactivo y un conjunto de funciones *serverless* que actúan como API, asegurando un desempeño ágil y escalable.

### 3.1. Stack Tecnológico

| Componente | Tecnología | Propósito |
| :--- | :--- | :--- |
| **Frontend** | React v19 + Vite | Interfaz de usuario dinámica y moderna. |
| **API** | Vercel Serverless Functions (Node.js) | Lógica de negocio para el *scraping* y consulta de datos del SIIAU. |
| **Scraping** | Axios, Cheerio, Iconv-lite | Peticiones HTTP, análisis sintáctico (parsing) del HTML y manejo de codificación de caracteres (`iso-8859-1`). |
| **Exportación** | jspdf, jspdf-autotable, html2canvas | Generación de documentos PDF y captura de la representación visual del DOM a imagen. |
| **Linting** | ESLint | Mantenimiento de la calidad y estándares del código. |

### 3.2. Configuración para Desarrollo

Para desplegar y desarrollar el proyecto en un entorno local, siga los siguientes pasos rigurosos.

**Prerrequisitos:**
* Node.js (v18+)
* npm (o el gestor de paquetes de su preferencia)

**Variables server-side requeridas:**

| Variable | Descripción |
| :--- | :--- |
| `FIREBASE_ADMIN_CREDENTIALS` | Credenciales de cuenta de servicio como JSON o JSON en base64. |
| `FIREBASE_PROJECT_ID` | ID del proyecto; opcional si las credenciales incluyen `project_id`. |
| `AUDIT_HASH_SECRET` | Secreto largo e independiente para pseudonimizar actores mediante HMAC-SHA256. No reutilizar claves de Firebase ni exponerlo al cliente. |

Rotar `AUDIT_HASH_SECRET` cambia los pseudónimos futuros; la estrategia de rotación debe conservarse fuera del repositorio si se requiere correlación histórica. Copie `.env.example` como `.env.local` para el desarrollo local y reinicie `vercel dev` cada vez que cambie una variable server-side.

**Instalación:**

```bash
# 1. Clonar el repositorio
git clone https://github.com/Miguel962jaliscoedu/Horario-UDG.git.git
cd Horario-UDG

# 2. Instalar dependencias
# (El proyecto utiliza npm según el package-lock.json)
npm install

# 3. Levantar el servidor de desarrollo (Vite + Vercel)
# Esto ejecutará el frontend y las funciones serverless de la carpeta /api
npx vercel dev
Si se utiliza el entorno de contenedores, la configuración expone los puertos 8501 (Aplicación) y 5001 (Backend API) para facilitar el desarrollo.
```

## IV. Advertencia de Uso (Disclaimer)
DECLARACIÓN IMPORTANTE: Como autor del código, es mi deber informar que esta herramienta se fundamenta en la técnica de web scraping sobre una interfaz pública del Sistema Integral de Información Administrativa y Escolar (SIIAU) de la Universidad de Guadalajara.

Esta herramienta es un esfuerzo de la comunidad y no cuenta con el respaldo o la afiliación oficial de la UDG.

La disponibilidad y precisión de la información dependen de la estabilidad de la estructura del sitio web oficial. Cualquier cambio en la página de consulta del SIIAU podría resultar en fallos en la extracción de datos o la inoperatividad de la API.

Utilice siempre la información generada con esta herramienta para fines de planificación únicamente y confirme cualquier dato crítico directamente con las fuentes oficiales de la Universidad.
