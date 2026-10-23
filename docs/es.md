# Memos

Conecte Gladys a [Memos](https://usememos.com), la aplicación libre y
autoalojada para tomar notas: escriba memos desde sus escenas (diario de la
casa, recordatorio), muestre los últimos en el panel e inicie una escena cuando
se escriba un memo con una etiqueta elegida. Gladys habla directamente con su
servidor Memos, en su red o en Internet.

Probada con un servidor Memos 0.31.0 real (la imagen Docker oficial,
`neosmemo/memos:stable`, octubre de 2026). La API de Memos ha cambiado mucho
entre versiones: los servidores más antiguos no son compatibles. Sus
comentarios son bienvenidos en el foro de Gladys.

## Requisitos previos

- Gladys Assistant 5.2 o posterior.
- Un servidor Memos 0.31 o posterior, accesible desde la máquina de Gladys: en
  el puerto 5230 por defecto, o detrás de un proxy inverso.
- Un token de acceso: en Memos, abra **Configuración → Tokens de acceso** y
  cree uno (elija la expiración **Nunca**, o recuerde renovarlo). La
  integración lee y escribe en nombre del usuario al que pertenece el token.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. En **Dirección de Memos**, introduzca la dirección IP del servidor, por
   ejemplo `192.168.1.50`: la integración usa entonces el puerto 5230. Añada
   el puerto si es otro (`192.168.1.50:5231`). Detrás de un proxy inverso,
   introduzca la dirección completa (`https://memos.example.org`).
3. Pegue el **Token de acceso** (empieza por `memos_pat_`).
4. **Leer Memos cada**: 1, 5 (por defecto), 15, 30 o 60 minutos. Los nuevos
   memos se comunican a las escenas en la siguiente lectura.
5. **Idioma de los nombres y mensajes** fija el nombre de las funciones (al
   añadir el dispositivo) y los textos de la integración. Francés por defecto.
6. Guarde y use **Probar la conexión**: muestra la versión de Memos, el usuario
   y el número de memos.
7. En la pestaña **Descubrimiento**, añada el dispositivo **Memos**.

## Dispositivo

**Memos** (un dispositivo para el servidor, en nombre del propietario del
token):

| Función                     | Valor                                                                       |
| --------------------------- | --------------------------------------------------------------------------- |
| Memos                       | número de sus memos (sin los archivados)                                    |
| Memos fijados               | número de sus memos fijados                                                 |
| Etiquetas                   | número de sus etiquetas de primer nivel (`#casa/garaje` cuenta como `casa`) |
| Memos con tareas pendientes | sus memos con una tarea sin marcar (`- [ ]`)                                |
| Último memo                 | primera línea del memo más reciente que puede leer, o «Ninguno»             |

Los contadores conservan su historial. La insignia del dispositivo indica si
Memos responde: **local** para una dirección de su red, **nube** para un host
público, **inaccesible** cuando no responde.

## Widget del panel

**Memos**: tres mosaicos (memos, fijados, pendientes), los seis memos más
recientes y un botón **Nuevo memo**. En los ajustes del widget, **Etiqueta**
muestra solo los memos de una etiqueta (y de sus subetiquetas), y **Solo memos
fijados** conserva los fijados. Toque un memo para leerlo entero; **Abrir en
Memos** aparece cuando se accede a Memos por https. **Nuevo memo** abre un
formulario: escriba el texto (Markdown y las `#etiquetas` funcionan como en
Memos) y la integración escribe un memo privado. En un widget con etiqueta, el
memo recibe esa etiqueta: un widget `compra` se convierte en una lista de la
compra.

## Disparadores de escena

- **Nuevo memo**: se escribe un memo en Memos, por usted, o por otro usuario
  cuando lo comparte con usted (protegido o público). Filtros: **Autor** (un
  nombre de usuario de Memos) y **Visibilidad**.
- **Nuevo memo con una etiqueta**: un nuevo memo lleva la etiqueta, o una de
  sus subetiquetas (`casa` vale también para `#casa/garaje`). Escriba la
  etiqueta sin `#`, exactamente como en Memos: las mayúsculas cuentan. La
  variable **Etiqueta encontrada** indica cuál.

Variables de ambos: **Texto del memo**, **Primera línea**, **Etiquetas**
(separadas por comas), **Autor (nombre de usuario)**, **Visibilidad**
(`private`, `protected` o `public`), **Visibilidad, en palabras** y **Enlace al
memo**.

La primera lectura tras la instalación es silenciosa: los memos ya presentes no
se comunican. Los memos escritos por esta integración nunca se comunican, así
que una escena no puede entrar en bucle consigo misma. Se comunican como mucho
diez memos por lectura; el resto se cuenta como visto.

## Acciones de escena

- **Escribir un memo en Memos**: **Texto del memo** (obligatorio, Markdown;
  inserte variables de escena con `{{`) y, si lo desea, **Etiquetas**
  (separadas por comas, sin `#`: se añaden al final del memo),
  **Visibilidad** (privado si no elige nada) y **Fijar el memo**. Devuelve
  **Id del memo**, **Primera línea** y **Enlace al memo**.
- **Fijar el último memo de una etiqueta**: fija el memo más reciente con la
  **Etiqueta**, o lo desfija con **Desfijar en su lugar**. Mismos resultados.
  Falla cuando ningún memo lleva la etiqueta.

## Ejemplos de escenas

- **Diario de la casa**: la puerta del garaje se abre después de las 22:00 →
  **Escribir un memo en Memos** con `Puerta del garaje abierta tarde`,
  etiquetas `casa, diario`: Memos fecha el memo, y el diario se busca por
  etiqueta.
- **Lista de la compra en la tableta de la cocina**: un widget con la etiqueta
  `compra` muestra los memos de la compra, y **Nuevo memo** añade uno con la
  etiqueta.
- **Menú de la semana**: cada lunes a las 8:00 → **Escribir un memo en Memos**
  `Menú de la semana`, etiqueta `menu`, **Fijar el memo** marcado; cada domingo
  por la noche → **Fijar el último memo de una etiqueta** `menu` con
  **Desfijar en su lugar**.
- **Mensaje de la familia**: disparador **Nuevo memo con una etiqueta**
  `gladys` → decir o enviar `{{triggerEvent.data.author}}:
{{triggerEvent.data.content}}`.
- **Recordatorio de tareas**: cada noche a las 20:00 → continuar solo si
  **Memos con tareas pendientes** es mayor que 0 → enviar un mensaje «Quedan
  tareas pendientes en Memos».

## Solución de problemas

- **«Memos rechazó el token de acceso»**: el token se eliminó, caducó o se
  copió mal. Cree uno nuevo en Memos → Configuración → Tokens de acceso.
- **«Memos no responde»**: compruebe la dirección y el puerto desde la máquina
  de Gladys. El contenedor usa una red puente: `localhost` es el propio
  contenedor, introduzca la dirección IP del servidor.
- **«Esta dirección no responde como Memos»**: una página de inicio de sesión
  de un proxy responde en lugar de Memos. Introduzca la dirección de Memos o
  deje pasar la máquina de Gladys.
- **«Este Memos es demasiado antiguo»**: actualice Memos (0.31 o posterior).
- **«Memos aún no tiene cuenta»**: abra Memos una vez, cree el administrador y
  luego el token.
- Un disparador con etiqueta no se activa: compruebe las mayúsculas de la
  etiqueta (`Casa` no es `casa`) y que el memo no lo haya escrito esta
  integración.
- Para ver más detalles en los registros de la integración, defina
  `LOG_LEVEL=debug`. El contenido de los memos nunca se escribe en los
  registros.

## Límites

- El dispositivo se identifica por el nombre de usuario de Memos: renombrar
  el usuario en Memos crea un dispositivo nuevo, y los disparadores vuelven a
  empezar con una lectura silenciosa.
- Un servidor Memos y un usuario: el propietario del token. Los contadores
  cuentan los memos de ese usuario; la lista, el widget y los disparadores
  muestran también los memos que comparten otros usuarios (protegidos o
  públicos).
- Los disparadores se activan en la siguiente lectura (5 minutos por defecto),
  no al instante.
- Un memo se escribe solo como texto Markdown: sin adjuntos, ubicación ni
  comentarios.
- La integración nunca elimina ni archiva nada en Memos.
- Sin relación con el proyecto Memos.
