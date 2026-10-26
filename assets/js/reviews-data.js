/* Reseñas de Google que se muestran en la home (sección "Reseñas de Google").
   Se cargan a mano: Google no permite traer las fotos que dejan los clientes en sus reseñas,
   y esta lista permite elegir cuáles se muestran.

   - La sección queda OCULTA mientras la lista esté vacía.
   - Se muestran máximo 6; las reseñas con foto de perfil van primero.
   - avatar: guarda la foto de perfil en assets/img/reviews/ y pon la ruta (no se pueden usar
     enlaces de Google: la política de seguridad del sitio los bloquea). Sin avatar se muestra
     la inicial del nombre.
   - Después de editar este archivo, sube el número de ?v= en index.html
     (<script src="assets/js/reviews-data.js?v=N">), porque los .js se guardan en caché un año.

   Botón "Deja tu reseña" (basta UNA de las dos opciones; si ambas están vacías el botón no aparece):
     - reviewUrl: el enlace corto de "Pedir reseñas" del Perfil de Negocio (Compartir perfil → Pedir reseñas).
     - placeId: el Place ID del negocio (empieza con "ChIJ"; se obtiene con la herramienta pública
       "Place ID Finder" de Google). Ver tools/README-SEO.md.
   mapsUrl: enlace de "compartir" de Google Maps, para "Ver todas en Google". */
window.ESCENA_REVIEWS_CONFIG = {
  placeId: "",
  reviewUrl: "",
  mapsUrl: "https://maps.app.goo.gl/o21U366WQ3pZURPY6"
};

window.ESCENA_REVIEWS = [
  // { name: "Nombre Apellido", rating: 5, text: "Texto de la reseña…", when: "hace 2 semanas", avatar: "assets/img/reviews/nombre.jpg" },
];
