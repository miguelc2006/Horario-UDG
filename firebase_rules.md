# Reglas finales de Firestore 📄

La política de acceso usa perfiles derivados del correo incluido en el token de Firebase Auth:

| Perfil | Dominio | Capacidades persistentes |
| --- | --- | --- |
| Alumno | `@alumnos.udg.mx` | Horarios cloud, evaluaciones, monitoreo/notificaciones y caché de profesores |
| Académico | `@academicos.udg.mx` | Evaluaciones, monitoreo/notificaciones y caché de profesores |
| Externo | Cualquier otro dominio | Consulta pública y planeación local |

La fuente final para revisar y copiar a **Firebase Console → Firestore → Rules** está en [`firebase.rules`](./firebase.rules). El archivo [`firebase.rules.proposed`](./firebase.rules.proposed) se conserva como antecedente y no debe usarse para el despliegue final. **El repositorio no publica reglas automáticamente.**

## Propiedades de seguridad

- Cada usuario institucional solo accede a sus propias subcolecciones bajo `users/{uid}`.
- `schedules` exige perfil alumno y valida el esquema básico del horario.
- `monitored-courses` y `fcmTokens` solo admiten lectura y borrado desde el cliente; Firebase Admin realiza las altas y actualizaciones.
- `notifications` solo admite lectura, borrado y el cambio de `read` a `true` desde el cliente; Firebase Admin crea el historial.
- `notificationPrefs/preferences` admite únicamente las preferencias booleanas conocidas.
- `ratings` valida autoría, campos permitidos, tipos, rangos, tamaño del comentario y campos inmutables.
- La caché `professors` es pública para lectura, requiere perfil institucional para escritura, valida campos y no permite borrado desde el cliente.
- `monitoring-queue`, `internal-account-profiles` y `account-audit-events` están denegadas a todos los clientes.
- Una regla raíz deniega cualquier colección o subcolección no declarada.

## Firebase Admin

Firebase Admin omite Firestore Rules. Por eso los endpoints privilegiados verifican el ID token y aplican nuevamente las capacidades en `api/_helpers/authorization.js`. La eliminación de identidad, la cola de monitoreo y la auditoría se gestionan exclusivamente en el servidor.

## Publicación manual

1. Revisar [`firebase.rules`](./firebase.rules), especialmente dominios y campos permitidos.
2. Copiar todo su contenido en **Firebase Console → Firestore Database → Rules**.
3. Usar el simulador de reglas para probar un alumno, un académico, un externo y una solicitud sin autenticar.
4. Publicar únicamente después de confirmar los flujos de horarios, evaluaciones, alertas, preferencias y eliminación de cuenta.

El archivo no exige actualmente `email_verified` para mantenerse alineado con la autorización del backend. Si se incorpora esa condición, debe agregarse también en `api/_helpers/authorization.js` y validarse de extremo a extremo.
