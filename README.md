# pilas-emociones

Actividad de clasificación de emociones para **NyPE — Neurociencia y Psicología Experimental**, UTDT, primer año. Creada por Guillermo Solovey en 2026, siguiendo [two-armed-bandit](https://github.com/gsolovey-utdt/two-armed-bandit).

Cada estudiante agrupa 17 palabras en su teléfono. El proyector reúne las respuestas y muestra un mapa, un árbol de familias, los parecidos de una palabra y los criterios escritos. Las respuestas son anónimas: no se piden nombres, correos ni datos personales.

Vanilla JS, sin framework, sin instalación y **sin build**. GitHub Pages sirve los archivos desde la raíz. Supabase JS v2 y qrcodejs se cargan por CDN; los gráficos son SVG propios.

## Preparar Supabase

1. Abrí el mismo proyecto que usa two-armed-bandit: `irryksaoygdklwtsjsru`.
2. En **SQL Editor**, pegá el contenido completo de [`schema.sql`](schema.sql) y ejecutalo una sola vez. Crea `pilas_responses`, el índice de sesión, la restricción única y las políticas RLS para inserción y lectura anónimas. También comprueba en la base que no falten ni se repitan palabras. No modifica las tablas de otras actividades.
3. Revisá las constantes `SUPABASE_URL` y `SUPABASE_ANON_KEY` al pie de **`index.html` y `admin.html`**. Ya están copiadas de la referencia. Si cambiás de proyecto, reemplazalas en ambos archivos por la URL y la clave **publishable/anon**, nunca una clave secreta o `service_role`.

La app usa solamente `insert` y `select`. No actualiza ni borra respuestas. La clave única `(session_code, participant_id)` impide duplicados, incluso si dos pestañas envían a la vez. Cada participante conserva un UUID por código de sesión en `localStorage`; otro navegador o dispositivo genera otro identificador. Los códigos separan clases; no funcionan como contraseñas. Según el modelo pedido, el panel docente no tiene contraseña y las filas son legibles con la clave pública. No escriban información personal en los criterios.

## Publicar en GitHub Pages

**Estado verificado al 28/10/2026:** el esquema ya está creado en el proyecto configurado y el guardado desde la web publicada funciona. Se comprobó un envío real desde la interfaz, su lectura, el reconocimiento al recargar, el rechazo de duplicados y una prueba de concurrencia de 60 participantes con conteo correcto en el proyector. Los registros de verificación quedaron bajo códigos exclusivos `qa-…`, separados de las sesiones de clase. El modo demo y los enlaces locales `/qa/` conservan su funcionamiento de prueba sin escritura en Supabase.

1. Creá el repositorio **`pilas-emociones`** en `gsolovey-utdt` y subí estos archivos a la raíz de la rama `main`.
2. En **Settings → Pages → Build and deployment**, elegí **Deploy from a branch**, rama **`main`**, carpeta **`/ (root)`** y guardá.
3. Esperá a que termine la publicación. La dirección será `https://gsolovey-utdt.github.io/pilas-emociones/`.

No hay que compilar ni crear una carpeta `dist`. `.nojekyll` conserva la publicación estática. Las fuentes de Google y los dos CDN necesitan conexión a Internet.

## Los dos links para una clase

Elegí un código distinto para cada comisión y encuentro. Ejemplo:

- Estudiantes: `https://gsolovey-utdt.github.io/pilas-emociones/index.html?s=emo1-2s2026`
- Proyector: `https://gsolovey-utdt.github.io/pilas-emociones/admin.html?s=emo1-2s2026`

**Usá un código diferente para el piloto**, por ejemplo `piloto-emo1-2s2026`. No reutilices el código del piloto en clase: las respuestas anteriores quedarían incluidas. Sin `s`, la página estudiantil pide el link al docente y el panel permite ingresar el código. Para códigos con espacios o símbolos, usá el formulario docente; arma el URL y el QR correctamente.

1. Abrí el proyector: muestra el conteo, el QR y el link, con los resultados ocultos.
2. Pediles que toquen una emoción y después un grupo. Pueden moverla de nuevo, devolverla a la lista, crear hasta seis grupos y quitar los vacíos. El orden se sortea por participante y se conserva al recargar. El tiempo comienza en **Empezar**.
   En celular, el tablero completo ocupa una pantalla: la lista de arriba tiene desplazamiento propio y los grupos quedan siempre visibles abajo. Tocá un grupo sin haber seleccionado una palabra para ver qué contiene; **Volver a la lista** vuelve a las emociones pendientes. En tablet y computadora, la lista y las palabras de cada grupo aparecen lado a lado. Los botones y las etiquetas conservan tamaños aptos para tocar, incluso cuando hay seis grupos.
3. Después de ubicar todas las palabras en al menos dos grupos, cada estudiante escribe su criterio y envía. Si falla Internet, el envío queda pendiente en ese dispositivo: **Reintentar** o recargar vuelve a intentar el mismo registro.
4. Hagan predicciones antes de tocar **Mostrar resultados**. **Congelar** detiene las consultas y descarta cualquier consulta en curso; **Seguir actualizando** trae también las respuestas que llegaron durante la pausa. La consulta se inicia cada 5 segundos, sin superponer pedidos. El tiempo de respuesta de la red se suma a ese intervalo.
5. El mapa usa solamente **Eje 1** y **Eje 2**, para que la clase proponga sus nombres. Los botones de espejo y giro se recuerdan por sesión. El selector de 2 a 12 familias comparte colores entre mapa y árbol. El panel técnico empieza plegado.

Con menos de 25 respuestas aparece la advertencia de inestabilidad; con menos de tres no se dibujan resultados. El conteo incluye sólo particiones válidas y un registro por participante. Las consultas paginan de a 1000 filas.

Después de la actividad, desplegá **Detalles técnicos** para conversar sobre el método: explica cómo las pilas se convierten en matrices y coordenadas, incluye un ejemplo numérico y una sección opcional de álgebra, y presenta la relación con el modelo circumplejo de Russell. El esquema teórico está rotulado como tal y las fuentes originales están enlazadas. Toda esta explicación queda dentro del panel plegable para que el grupo pueda proponer nombres para los ejes antes de leerla.

## Demo y exportación

**Modo demo** genera 40 respuestas en el navegador y muestra **DATOS SIMULADOS** permanentemente. No guarda nada en Supabase y detiene las consultas en vivo. Al salir vuelve a los datos de la sesión. Conserva la pantalla de espera hasta que el docente elige mostrar resultados. Las posiciones inventadas para la simulación no intervienen en el análisis de respuestas reales.

**Exportar CSV** descarga dos archivos UTF-8 con BOM:

- `pilas_CODE_respuestas.csv`: UUID, fecha, cantidad de grupos, criterio, duración y un número de grupo por palabra.
- `pilas_CODE_matriz.csv`: matriz de proporciones 17×17 con etiquetas de filas y columnas.

Si el navegador bloquea la segunda descarga, usá los dos links que aparecen debajo de la barra. En demo se agrega `_demo` al nombre para reconocer los archivos simulados. Los números de grupo de estudiantes son arbitrarios y no se comparan directamente entre personas. Los textos que podrían interpretarse como fórmulas de planilla se exportan con un apóstrofo inicial.

## Pruebas

Abrí [`test.html`](test.html) directamente en el navegador o desde Pages: imprime **PASS/FAIL** por prueba, sin consultar Supabase. Incluye el ejemplo de cinco palabras, los autovalores y vectores conocidos (tolerancia 1e-8), recuperación de distancias, tres bloques, validación, enlace promedio, perfiles, masa negativa, empates, orientación y demo.

También podés ejecutar exactamente las mismas aserciones con Node, sin instalar paquetes:

```sh
node -e "const r=require('./tests.js').runAnalysisTests(require('./analysis.js')); console.table(r); if(r.some(t=>!t.pass)) process.exitCode=1"
```

Para una vista local, serví esta carpeta con cualquier servidor estático, por ejemplo `python -m http.server 8000`, y abrí `http://localhost:8000/`. Para verificar 60 envíos reales simultáneos se necesita la tabla ya creada y una prueba separada con un código exclusivo de piloto; no uses datos simulados en una sesión de clase.

## Archivos

| Archivo | Función |
|---|---|
| `index.html`, `app.js` | Cuatro pantallas, interacción por toques, borrador y reintentos |
| `admin.html`, `admin.js` | Proyector, QR, consultas, SVG, demo y CSV |
| `analysis.js` | CONFIG compartida y funciones puras, sin DOM |
| `styles.css` | Estilos completos de la referencia y extensiones de la actividad |
| `test.html`, `tests.js` | Pruebas compartidas entre navegador y Node |
| `schema.sql` | Tabla, restricciones, índice y políticas RLS |
| `CLAUDE.md` | Guía de arquitectura y convenciones para cambios |
