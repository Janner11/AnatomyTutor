# Assessment Module

Este modulo implementa el sistema de evaluacion adaptativa de AnatomyTutor.

## Componentes

- `adaptiveAssessment.js`: motor principal (adaptatividad, generacion y evaluacion de ejercicios).
- `progressStore.js`: persistencia de progreso por sistema/concepto/tipo en `localStorage`.
- `assessmentHarness.js`: simulador rapido para probar el motor sin interfaz 3D.

## Tipos de ejercicios

- `visual-identification`: identificar estructura tocando hotspot en el modelo.
- `matching`: emparejar descripcion/funcion con la estructura correcta.
- `open-response`: responder en texto libre.

## Integracion

`quizManager.js` mantiene su API publica y delega al motor adaptativo.

## Ejecucion del harness

```bash
npm run test:assessment
```

El harness imprime resultados simulados y muestra precision + sugerencias de refuerzo.

