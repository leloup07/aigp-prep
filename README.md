# AIGP Prep

Aplicación local para preparar el examen IAPP AIGP. Un solo usuario, sin servidor, sin conexión.

## Arranque

```bash
npm install        # solo la primera vez
npm run dev        # importa las fuentes y abre http://localhost:5173
npm run build      # importa, comprueba tipos y genera dist/index.html (un único archivo)
npm run preview    # sirve dist/ en http://localhost:4173
npm test           # tests del importador, corrección, escenarios, reparto y reloj
npm run import     # solo reimportar las fuentes
```

Fuentes (solo lectura): `~/Documents/IAPP/Revisado_2026-09-25/fuentes_md/`. Se pueden cambiar con `AIGP_SRC=/otra/ruta`.
El importador abre únicamente los 18 archivos esperados y rechaza cualquier nombre que contenga «Practice Exam» o «AIGP_08».
Si editas un `.md`, vuelve a lanzar `npm run dev` (o `npm run import`) y la app reflejará los cambios. Los intentos anteriores se conservan
marcados como «versión anterior».

`dist/index.html` se puede abrir con doble clic, pero algunos navegadores (Safari) no guardan datos en `file://`; en ese caso la app lo avisa
y conviene usar `npm run preview`.

Todo el estado vive en IndexedDB del navegador. Haz copias con **Ajustes → Exportar JSON**.

## Usarla en el iPad

```bash
npm run ipad
```
Con el Mac y el iPad en la misma wifi, abre en Safari del iPad `http://Enriques-MacBook-Pro.local:4173`
y añádela a la pantalla de inicio (Compartir → Añadir a pantalla de inicio). Los datos del iPad son independientes
de los del Mac: pásalos con Ajustes → Exportar / Importar JSON.
