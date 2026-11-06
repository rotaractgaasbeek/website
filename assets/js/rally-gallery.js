(() => {
  const lightbox = document.querySelector("[data-rally-lightbox]");
  if (typeof lightbox.showModal !== "function") return;

  const links = [...document.querySelectorAll(".rally-gallery__item a")];
  const navigation = lightbox.querySelector("[data-rally-photo-navigation]");
  const count = lightbox.querySelector("[data-rally-photo-count]");
  const photo = document.createElement("img");
  navigation.before(photo);
  let openingLink;
  let currentIndex = 0;

  function showPhoto(index) {
    currentIndex = (index + links.length) % links.length;
    const link = links[currentIndex];
    photo.alt = link.querySelector("img").alt;
    photo.src = link.href;
    count.textContent = `Foto ${currentIndex + 1} van ${links.length}`;
  }

  links.forEach((link, index) => {
    link.setAttribute("aria-haspopup", "dialog");
    link.addEventListener("click", event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openingLink = link;
      showPhoto(index);
      lightbox.showModal();
    });
  });

  lightbox.querySelector("[data-rally-previous]").addEventListener("click", () => showPhoto(currentIndex - 1));
  lightbox.querySelector("[data-rally-next]").addEventListener("click", () => showPhoto(currentIndex + 1));
  lightbox.addEventListener("keydown", event => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    showPhoto(currentIndex + (event.key === "ArrowLeft" ? -1 : 1));
  });

  lightbox.addEventListener("close", () => {
    openingLink.focus({ preventScroll: true });
  });
})();
