# Historial de cambios

Todos los cambios importantes de Bitcoin Tracker, de la versión más reciente a la más antigua. Las cifras de los ejemplos están inventadas. La app es un registro personal: no opera ni se conecta a ningún exchange, y nada de esto es una recomendación de inversión.

## 23 de noviembre de 2026

### Trading (nuevo apartado)
- **Sumar Trading a la cartera:** la opción «Sumar los BTC ganados con trades a mi cartera» viene **desactivada** en las cuentas nuevas. Activada, Inicio (en vista simple y en pro) enseña una tabla con «Cartera», «Trading (neto)» y «Total», en BTC y en valor, en la moneda elegida. El neto de Trading es ganado menos perdido, así que **las pérdidas restan**. El **precio medio de compra no cambia** nunca por los trades: solo cambian el total en BTC y su valor.
- **Resultado en dinero (opcional):** en un trade cerrado puedes escribir cuánto ganaste (positivo) o perdiste (negativo) en EUR, USD o AUD; la moneda por defecto es la de tu cuenta. Los BTC del trade son **resultado ÷ precio de BTC en esa moneda**, redondeados a 8 decimales.
- **De dónde sale el precio:** de la vela de Kraken del par correspondiente (XBT/EUR, XBT/USD o XBT/AUD) en el momento del cierre: la de 1 minuto si es reciente, la de 1 hora hasta unas 4 semanas y la diaria si no hay hora o es más antiguo (se usa el precio medio ponderado de esa vela). Si no hay vela o no hay conexión, se usa el precio de salida del trade convertido con el cambio disponible. El precio es editable.
- **Antes de guardar** se ve la cuenta («−100 € → −0,00123001 BTC a 81.300 €/BTC») para confirmarla o cambiarla. Se guardan el importe, la moneda y el precio usado, y el detalle del trade los enseña. Los BTC escritos a mano siguen mandando sobre este cálculo.
- **Las pérdidas restan** en el «Total histórico», en «Por mes» y en Ganado, Perdido y Neto; el total se sigue mostrando en la moneda que elijas. Con trades en monedas mezcladas, el neto en BTC cuadra.
- **Corregido al hacerlo:** el cierre de hoy sin hora ya usa la vela diaria de hoy (antes se saltaba la consulta hasta pasado el mediodía UTC).
- **Margen destinado (opcional):** cada trade puede llevar el margen en BTC que le destinaste y una nota libre (por ejemplo, «x10 con 0,15 BTC de margen»). Se ve en el detalle del trade, se exporta y **no cambia ningún cálculo**. El «margen para la sugerencia» del formulario es otro campo: solo sirve para proponer los BTC ganados.
- **Importar el Excel original:** se ignoran sin fallar las celdas de error (#VALUE!), las notas sueltas, los textos de resumen bajo la tabla y las columnas sin cabecera (como un mes vacío). «1. x5» en la columna Trade se lee como el trade 1 con apalancamiento x5, y los demás trades quedan sin apalancamiento. La vista previa indica cuántos trades traen apalancamiento.
- **Dónde está:** aparece por defecto en la barra de abajo (Inicio · Mercado · ＋ · Trading · Ajustes). Quien no lo quiera lo apaga en Ajustes → Apariencia; en ese caso la barra vuelve a llevar Estadísticas, que también se alcanza desde una tarjeta de Inicio.
- **El botón ＋** abre una hoja con «Apuntar compra», «Apuntar venta» y «Nuevo trade».
- **Un trade** es una operación de entrada y salida, larga (gana si el precio sube) o corta (gana si baja). Se guarda con fechas, precios, moneda (USD, EUR o AUD), margen en BTC, comisiones, plataforma y nota. El apalancamiento es opcional y va por trade.
- **El % y los BTC ganados se escriben a mano y mandan sobre cualquier cálculo.** El cálculo automático (movimiento del precio × apalancamiento − comisiones) solo aparece como «Sugerencia» en el formulario, con un botón para usarla.
- **Detalle de cada trade** (al tocarlo): lo ganado o perdido en BTC, lo que vale hoy, lo que valía al cerrar y el total acumulado tras ese trade, más el cálculo paso a paso. Se puede editar, duplicar y borrar (con confirmación).
- **Resumen:** BTC ganados, perdidos y netos; su valor al precio actual; trades ganadores; mejor y peor trade; racha actual; duración media; y la **«Media por trade»** (media simple de los % de los trades cerrados). Los trades abiertos van aparte y no suman hasta que se cierran.
- **«Por mes»:** tabla según el mes de cierre, con el número de trades, los BTC ganados y la media de % de cada mes.
- **Gráficas:** el total de BTC ganados acumulado trade a trade (línea escalonada) y barras con el % de cada trade.
- **Importar desde Excel o CSV** con vista previa. Se lee «Total ganado (BTC)» de cada trade y, si la hoja trae «Total histórico», se comprueba **fila a fila** que la suma acumulada cuadra; si alguna no cuadra, la vista previa avisa antes de guardar. Un «x5» en la cabecera o en la columna Trade se lee como apalancamiento.
- **Exportar** los trades a CSV y XLSX.
- **Informe del año:** una sección «Trading» con lo ganado o perdido en los trades cerrados ese año, en euros al precio del día de cierre. Es una orientación, no asesoramiento fiscal.
- **Avisos de trades abiertos:** cuando llevan más de X días abiertos o cuando van en −X % o +X %. Respetan las horas de silencio, el límite diario y la prioridad de cada aviso.
- **Cartera:** opción para sumar los BTC ganados con trades al total de Inicio, con una línea aparte «de trading». El precio medio de las compras no cambia.
- Ejemplo inventado: una compra de 0,05 BTC de margen con un +12 % escrito a mano da +0,006 BTC; la sugerencia automática solo propone ese número, no lo impone.

### Velas en directo y precio en vivo
- **Gráfico pro** a pantalla completa, con velas, volumen, medias móviles (7, 25 y 99), tus compras (C), ventas (V) y trades (E y S) sobre las velas, línea del precio medio y del próximo nivel del plan, rendimiento por periodos y tu posición. Se puede hacer zoom pellizcando y moverse arrastrando.
- **Temporalidades:** 1m y 5m en directo, y 15m, 1h, 4h, 1D y 1S desde el servidor.
- **1m y 5m en directo** mientras la pantalla está abierta, con la conexión pública de Kraken (WebSocket, sin clave). Se desconecta al salir o al pasar a segundo plano, se reconecta sola si se corta y, sin conexión, enseña las últimas velas guardadas con el aviso «sin directo».
- **Precio en vivo en toda la app** mientras está abierta: valor de la cartera, ganancias y porcentajes se actualizan solos (como mucho una vez por segundo). Si falla, se usa el precio del servidor y se indica «Precio de hace X min».
- **En el servidor**, la tarea programada guarda las velas de 15m y 1h cada 15 minutos y las de 4h, 1D y 1S cada pocas horas (como mucho 300 velas por temporalidad). Nada de esto gasta cuota de la base de datos del usuario.

### Vista simple y vista pro
- **Vista pro** (estilo exchange, sin copiar marcas de nadie): Inicio con el valor y el PnL arriba, tabla de datos de la cartera, precio en vivo, velas, rendimiento y botones «Apuntar compra» y «Apuntar venta»; debajo, pestañas Operaciones · Trades · Plan · Avisos, con el historial de órdenes en tabla.
- **También en pro:** Estadísticas con las gráficas de valor y rentabilidad en área o en velas, y tablas con el BTC a 8 decimales; Mercado con la lista de precios y las ballenas en tablas; Trading con la lista de trades en tabla.
- **Cómo se activa:** en Ajustes → Apariencia o con el atajo «PRO» de la cabecera de Inicio. Por defecto es la vista simple. Cambia solo la presentación: los datos y los cálculos son los mismos.
- **Gráfico de velas:** al mantener pulsado, una cruz con la fecha, apertura, máximo, mínimo, cierre y volumen; al tocar una marca C, V, E o S, una ficha con la operación y un enlace para editarla. Los indicadores activados se recuerdan.
- Los botones dicen «Apuntar compra» y «Apuntar venta», nunca «Comprar» o «Vender» a secas.

### Hora opcional
- Las compras, las ventas y los trades pueden llevar una **hora** (HH:MM). Es opcional: si está, la vista pro la muestra junto a la fecha en el historial; si no, solo la fecha. Los trades tienen hora de inicio y de cierre. La hora no cambia ningún cálculo.

### Corregido
- **Velas de 1D y 1S vacías en el Gráfico pro:** el servidor (tareas de GitHub) solo guardaba las velas de 4h, 1D y 1S si una ejecución caía justo en los primeros 15 minutos de un bloque de 4 horas, y las ejecuciones programadas llegan cada 5 o 6 horas, así que casi nunca ocurría. Ahora cada temporalidad se vuelve a pedir cuando su documento supera cierta antigüedad (1h: 50 min; 4h, 1D y 1S: 3 h; 15m, siempre), el servidor espera 1,1 s entre peticiones a Kraken (su API pública limita las llamadas seguidas) y reintenta una vez si le dice que va demasiado rápido. Además, si una temporalidad aún no está guardada, la app la pide directamente a Kraken (REST) en lugar de dejar el gráfico vacío, y avisa de ello.
- **Cada pantalla se abre arriba del todo** (antes, /grafico conservaba el scroll de Inicio y se veía abajo).
- **Al cambiar a una temporalidad sin datos** ya no se queda la escala de precios de la anterior: se limpian las series y se reinicia la escala.
- **Minigráfico de «Valor actual» en Inicio:** solo se dibuja si hay compras y con la evolución real del valor de la cartera por días del último mes (desde la primera compra); sin compras, con menos de 3 días de historia o sin variación, no se pinta (antes salía una línea que no correspondía a nada o una recta).
- **Gráfico pro, marcas y líneas:** las marcas que se solapan se agrupan en un marcador con el número (y se reagrupan al hacer zoom o desplazarse); «Mis trades» va oculto por defecto en 1D y 1S (se recuerda por separado para el resto de temporalidades); la línea punteada entrada-salida solo se dibuja para el trade seleccionado (al tocar su marca o con «Ver gráfico» desde su ficha, que abre la temporalidad adecuada).
- **Máx., Mín. y Vol. de 24 h** del Gráfico pro: se rellenan con el ticker de Kraken (en directo para EUR y USD, y por REST, que también da AUD) y, si falla, con las velas de 1 hora; también en el modo demo.
- **Histograma de compras (Estadísticas):** un precio justo en el límite entre dos intervalos caía a veces en el intervalo anterior por un redondeo de coma flotante (por ejemplo, con mínimo 46.014,48, máximo 46.218,56 y una compra a 46.039,99). Ahora los intervalos son [a, b), el último incluye el máximo, y el cálculo usa enteros. Era la causa de un test de la auditoría que fallaba de forma intermitente.
- **Auditoría reproducible:** los datos aleatorios de los tests de la auditoría usan una semilla fija (`FC_SEED` permite probar otras), de modo que cada ejecución es igual.
- **Gráfico de Inicio «rayado» o que «se volvía loco»:** con el precio en vivo, el gráfico se destruía y se volvía a crear cada segundo (unas 30 veces en 30 segundos), repitiendo la animación de dibujado mientras se movía con el dedo. Ahora se crea una sola vez al abrir la pantalla y cada precio nuevo solo actualiza el último punto; al salir de la pantalla se destruye.
- **Gráfico pro (velas):** las marcas, las líneas de los trades y los niveles ya no se redibujan con cada precio en vivo; las velas en directo actualizan solo la última vela, se descartan los tiempos repetidos o desordenados y la copia local de las velas se guarda como mucho cada 15 segundos.
- **Gestos en el móvil:** en los gráficos, el scroll vertical mueve la página y el gráfico solo se desplaza en horizontal o con el pellizco; la rueda del ratón ya no atrapa el scroll de la página.
- **«Abrir gráfico pro»:** ahora va incluido en la app principal (antes se descargaba aparte y podía no abrirse), y si una pantalla falla muestra un aviso en lugar de quedarse sin responder.
- **Cuenta nueva sin compras:** Inicio muestra «Aún no has apuntado ninguna compra» con el botón «Apuntar compra» y, debajo, el gráfico del precio de BTC. El minigráfico del saldo enseña el precio de BTC en lugar de una línea de ceros.
- **CSV con fechas día/mes/año:** al importar un CSV, una fecha como `12/08/2026` se leía como fecha americana (8 de diciembre). Ahora se lee como 12 de agosto. Afecta también a la importación de compras.
- Las operaciones con un importe que se redondea a cero ya no muestran un signo menos.
- El plan con compras hechas en otras monedas calcula bien los niveles.

### Auditoría de cálculos
- **Calculadora de control** independiente de la app, con aritmética decimal exacta, para comprobar los cálculos de compras, FIFO, plan, calculadoras, avisos y trading.
- **Tests de propiedades:** cientos de carteras y de conjuntos de trades aleatorios, y reglas que siempre deben cumplirse (por ejemplo, que el neto es lo ganado menos lo perdido).
- **Cuenta vacía:** una pasada completa en el móvil con una cuenta sin compras, ventas ni trades (demo vacía y, con `npm run auditoria:vacia`, un usuario nuevo en el emulador de Firebase). Comprueba sin errores en consola, un solo gráfico por pantalla, que el gráfico de Inicio no se rehace con 30 segundos de precio en vivo y que «Abrir gráfico pro» abre.
- **Auditoría en el navegador** (modo demo, móvil): lee las cifras que muestra cada pantalla y las compara con la calculadora de control, también en la vista pro. Resultado actual: **374 comprobaciones, 0 diferencias**. Además hay **287 tests automáticos** y **55 tests de las reglas de seguridad** de la base de datos.

## 22 de noviembre de 2026

### Compras, ventas y cálculos
- Apuntar compras y ventas a mano, con vista previa en directo: BTC recibidos, % de comisión, nuevo precio medio y resultado antes de confirmar.
- Precio medio con y sin comisiones, «rentable desde», ganancia por compra y aviso si la comisión supera el 3 %.
- Ventas por FIFO (el criterio de Hacienda), ganancias realizadas e informe anual en CSV. No deja vender más BTC de los que tienes.
- Valores en EUR, USD y AUD; cada operación conserva su moneda.
- Plataforma de cada compra (Revolut, Binance, Coinbase, Kraken, Bit2Me u otra), con la última usada preseleccionada y la comisión habitual de cada plataforma; comisión en € o en %.
- Calculadoras: bajar el precio medio, «¿y si BTC llega a X?» y «si vendo hoy» (con una estimación orientativa del impuesto).
- Plan con niveles clave, compra periódica (DCA) semanal y objetivos con precio de venta.
- Importar desde Excel o CSV con vista previa y exportar a CSV y XLSX.

### Pantallas y diseño
- Rediseño: fondo negro con un brillo naranja detrás del saldo, cristal solo en elementos flotantes, animaciones suaves (que se quitan si el sistema pide menos movimiento), barra inferior con botón central.
- Inicio con mini gráfico de 7 días, chips (precio medio, rentable desde, próximo nivel, miedo y codicia) y gráfica principal con una marca por compra o venta.
- Tirar para refrescar, esqueletos de carga y modo privado que oculta las cifras.
- **Aviso de actualización:** cuando hay una versión nueva de la app aparece «Hay una versión nueva · Actualizar» y se recarga al pulsar.
- Modo demo con una cartera inventada, sin cuenta.

### Estadísticas
- Cartera frente a lo invertido, rentabilidad en el tiempo, caída desde el máximo, mejores y peores días.
- Mis compras: mapa de precios, invertido por mes, BTC acumulado, satoshis, calendario de DCA, comisiones por plataforma y comparativa «si lo hubieras metido todo el primer día».
- Mercado: velas diarias y semanales, índice de miedo y codicia, dominancia de bitcoin, ciclo del halving y comisiones de la red.

### Mercado: ballenas e instituciones
- **Empresas y gobiernos con BTC**, con su evolución en el tiempo y los últimos movimientos.
- **Ballenas:** transacciones grandes detectadas en los bloques nuevos (desde 500 BTC), con enlace al explorador de la red.
- **Carteras públicas** que publican entidades con su fuente, que se pueden seguir para recibir un aviso si se mueven.
- Todo se descarga en el servidor y se comparte entre usuarios, sin gastar cuota de cada cuenta.

### Avisos
- 36 avisos en grupos: precio, mi cartera, mi plan, trading, mercado, ballenas y carteras, resúmenes, cuenta y seguridad.
- **Avisos push** en el móvil y el ordenador y, opcionalmente, por Telegram.
- Alertas de precio a medida, prioridad y canal por aviso, horas de silencio, límite diario, pausa e historial de los últimos 30 días.
- Aviso al iniciar sesión desde un dispositivo nuevo.
- Los avisos son información, nunca consejos de inversión.

### Cuenta y seguridad
- Cuentas privadas con verificación del correo, reglas de la base de datos que solo dejan ver y cambiar lo propio, validación de los datos en el cliente y en el servidor, y cabeceras de seguridad.
- Bloqueo opcional con Face ID o huella, rechazo de contraseñas filtradas y borrado de cuenta con todos los datos.
- Funciona sin conexión y se instala como app en el móvil.
