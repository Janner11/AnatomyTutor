# Anatomy Tutor 3D

**Anatomy Tutor 3D** es una plataforma interactiva para la exploración, aprendizaje y evaluación de anatomía humana en 3D. Permite seleccionar sistemas anatómicos, identificar estructuras, practicar con exámenes adaptativos y seguir rutas de aprendizaje guiado, todo sobre modelos 3D realistas.

---

## Características principales

- **Visualización 3D**: Explora modelos anatómicos de diferentes sistemas corporales (circulatorio, digestivo, muscular, etc.) usando Three.js.
- **Selección precisa**: Selecciona estructuras anatómicas mediante raycasting y hotspots interactivos.
- **Modo Examen**: Practica con ejercicios adaptativos de identificación visual, emparejamiento y respuesta abierta. El sistema ajusta la dificultad y refuerza conceptos débiles.
- **Aprendizaje Guiado**: Sigue rutas paso a paso para aprender cada parte de un sistema, con descripciones y funciones.
- **Soporte para gestos de mano**: Activa el modo "Manos" para controlar la interfaz y seleccionar usando hand tracking (requiere webcam compatible).
- **Panel de información**: Consulta detalles anatómicos, espaciales y de fuente de cada estructura seleccionada.
- **Editor de hotspots**: Ajusta y descarga zonas de interacción para personalizar la experiencia.

---

## Instalación y ejecución

### Requisitos
- Node.js >= 16.x
- npm >= 8.x
- Navegador moderno (Chrome, Edge, Firefox)

### Instalación

Clona el repositorio y entra en la carpeta del proyecto:

```bash
git clone https://github.com/tuusuario/AnatomyTutor.git
cd AnatomyTutor-main
```

Instala las dependencias:

```bash
npm install
```

### Ejecución en modo desarrollo

Inicia el servidor de desarrollo (con recarga automática):

```bash
npm start
```

Esto abrirá la app en `http://localhost:8080`.

### Compilación para producción

```bash
npm run build
```

Los archivos optimizados quedarán en la carpeta `dist/`.

---

## Estructura del proyecto

- `js/` — Código fuente principal (UI, lógica de selección, raycasting, hand tracking, quiz, etc.)
- `data/` — Archivos JSON con información anatómica, rutas guiadas, hotspots, etc.
- `model/` — Modelos 3D (GLB) y texturas de cada sistema anatómico.
- `css/` — Estilos visuales.
- `index.html` — Entrada principal de la app.

### Principales módulos JS
- `app.js` — Inicialización, integración de módulos y lógica principal.
- `uiPanel.js` — Panel de usuario, botones, status, editor de hotspots.
- `modelLoader.js` — Carga y gestión de modelos 3D.
- `raycastSelection.js` — Selección precisa de estructuras.
- `quizManager.js` — Lógica de modo examen y feedback.
- `guidedLearning/guidedLearningManager.js` — Aprendizaje guiado paso a paso.
- `assessment/` — Motor de evaluación adaptativa.

---

## Uso de la aplicación

1. **Selecciona un sistema corporal** en el menú superior.
2. **Explora el modelo 3D**: rota, acerca y selecciona estructuras.
3. **Activa el modo examen** para practicar identificación y reforzar conceptos.
4. **Sigue el aprendizaje guiado** para recorrer cada parte del sistema.
5. **Activa el modo manos** para controlar con gestos (requiere webcam).
6. **Consulta información detallada** de cada selección en el panel derecho.

---

## Personalización y edición

- Puedes editar los archivos en `data/` para agregar o modificar información anatómica, rutas guiadas y hotspots.
- El editor de hotspots permite ajustar zonas de interacción y descargar el archivo actualizado.

---

## Dependencias principales

- [three.js](https://threejs.org/) — Renderizado 3D
- [gsap](https://greensock.com/gsap/) — Animaciones
- [@mediapipe/tasks-vision](https://google.github.io/mediapipe/) — Hand tracking
- [webpack](https://webpack.js.org/) — Bundler

---

## Scripts disponibles

- `npm start` — Servidor de desarrollo
- `npm run build` — Compilación producción
- `npm run test:assessment` — Prueba del motor de evaluación adaptativa (sin UI)

---

## Créditos y licencia

- Modelos 3D y texturas: ver carpeta `model/` y archivos de licencia.
- Código: MIT License (o especificar)

---

## Preguntas frecuentes

**¿Qué navegador es compatible?**
- Chrome, Edge, Firefox (se recomienda Chrome para hand tracking).

**¿Funciona sin webcam?**
- Sí, pero el modo manos requiere webcam compatible.

**¿Puedo agregar mis propios modelos o rutas?**
- Sí, edita los archivos en `model/` y `data/` siguiendo el formato existente.

---

## Contacto y soporte

Para dudas, sugerencias o reportes de bugs, abre un issue en GitHub o contacta al autor.

