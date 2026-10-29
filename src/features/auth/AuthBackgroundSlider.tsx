"use client";

import { useEffect, useState } from "react";
import { cn } from "cn";

const SLIDES = [
  {
    src: "/images/hero-consultant.jpg",
    label: "Accueil & Conseil en agence",
  },
  {
    src: "/images/visa-tourisme.jpg",
    label: "Visas & Départs à l'international",
  },
  {
    src: "/images/etudes-etranger.jpg",
    label: "Études à l'étranger & Campus",
  },
  {
    src: "/images/voyage-affaires.jpg",
    label: "Mobilités & Voyages d'affaires",
  },
];

export function AuthBackgroundSlider() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % SLIDES.length);
    }, 4500);

    return () => clearInterval(timer);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {SLIDES.map((slide, index) => {
        const isActive = index === currentIndex;
        return (
          <div
            key={slide.src}
            className={cn(
              "absolute inset-0 transition-opacity duration-1000 ease-in-out",
              isActive ? "opacity-30" : "opacity-0",
            )}
          >
            <img
              src={slide.src}
              alt=""
              className={cn(
                "h-full w-full object-cover object-center filter brightness-95 contrast-110 transition-transform duration-[6000ms] ease-out",
                isActive ? "scale-105" : "scale-100",
              )}
            />
          </div>
        );
      })}

      {/* Dégradé marine élégant assurant la lisibilité totale du texte blanc */}
      <div className="absolute inset-0 bg-linear-to-r from-navy-950/95 via-navy-900/85 to-navy-900/75" />

      {/* Barres d'indication discrètes en bas du panneau */}
      <div className="absolute bottom-4 left-12 z-10 hidden items-center gap-1.5 lg:flex">
        {SLIDES.map((slide, index) => (
          <button
            key={slide.src}
            type="button"
            tabIndex={-1}
            onClick={() => setCurrentIndex(index)}
            className="pointer-events-auto group relative h-1 cursor-pointer overflow-hidden rounded-full transition-all duration-300"
            style={{ width: index === currentIndex ? "28px" : "10px" }}
            aria-label={slide.label}
          >
            <span
              className={cn(
                "absolute inset-0 rounded-full transition-colors",
                index === currentIndex ? "bg-citron-400" : "bg-white/30 group-hover:bg-white/60",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
