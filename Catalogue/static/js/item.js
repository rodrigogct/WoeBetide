const image = document.querySelectorAll(".item .images img")
const imageCarousel = document.querySelectorAll(".item-carousel .images img")
const mainContainer = document.querySelector(".image-selector")
const secondImage = mainContainer.querySelector("img")
let closeButton = document.querySelector(".close")
let btn = document.querySelector(".images")
let carouselControls = document.querySelectorAll(".carousel-control-prev, .carousel-control-next");
let currentIndex = 0;
let catalogue = document.querySelectorAll(".catalogue .elements")
let navbar = document.querySelectorAll(".navbar")
let isZoomed = false;
let lastXPercent = 50;
let lastYPercent = 50;

function showImage(index) {
    const webpPath = image[index].dataset.webp;
    secondImage.src = webpPath || image[index].src;

    currentIndex = index;
}

function prevImage() {
    currentIndex = (currentIndex - 1 + image.length) % image.length;
    showImage(currentIndex);
}

function nextImage() {
    currentIndex = (currentIndex + 1) % image.length;
    showImage(currentIndex);
}

// Zoom in image when clicking on it. 
image.forEach((img, index) => {
    img.addEventListener('click',()=> {
        mainContainer.style.opacity = 1;
        mainContainer.style.pointerEvents = "all";
        showImage(index);      

        // Hide carousel controls
        carouselControls.forEach(control => {
            control.style.display = "none";
        });

        // Hide catalogue
        catalogue.forEach(control => {
            control.style.display = "none";
        })

        // Hide navbar
        navbar.forEach(control => {
            control.style.display = "none";
        })
    });
});

imageCarousel.forEach((img, index) => {
    img.addEventListener('click',()=> {
        mainContainer.style.opacity = 1;
        mainContainer.style.pointerEvents = "all";
        showImage(index);      

        // Hide carousel controls
        carouselControls.forEach(control => {
            control.style.display = "none";
        });

        // Hide catalogue
        catalogue.forEach(control => {
            control.style.display = "none";
        })

        // Hide navbar
        navbar.forEach(control => {
            control.style.display = "none";
        })
    });
});

// Close out image when clicking on the ´x´ button
closeButton.addEventListener("click", () => {
    mainContainer.style.opacity = 0;
    mainContainer.style.pointerEvents = "none";

    // Show carousel controls
    carouselControls.forEach(control => {
        control.style.display = "block";
    });

    // Show catalogue
    catalogue.forEach(control => {
        control.style.display = "block";
    });

    // Show catalogue
    navbar.forEach(control => {
        control.style.display = "block";
    });
})

// Zoom in image for details in image-selector
let zoomedIn = false;

secondImage.addEventListener('click', function(e) {
    const rect = secondImage.getBoundingClientRect();
    
    if (!zoomedIn) {
        // Calculate click position as a percentage of the image
        const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
        const yPercent = ((e.clientY - rect.top) / rect.height) * 100;

        // Set transform origin to where user clicked
        secondImage.style.transformOrigin = `${xPercent}% ${yPercent}%`;
        secondImage.style.transform = "translate(-50%, -50%) scale(3)";
        secondImage.style.cursor = "zoom-out";
        zoomedIn = true;
    } else {
        // Reset zoom to default (centered)
        secondImage.style.transformOrigin = "center center";
        secondImage.style.transform = "translate(-50%, -50%) scale(1)";
        secondImage.style.cursor = "zoom-in";
        zoomedIn = false;
    }
});






