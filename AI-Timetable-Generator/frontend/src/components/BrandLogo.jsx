import lightBackgroundLogo from "./logo1-transparent.png";
import darkBackgroundLogo from "./logo2-transparent.png";

export default function BrandLogo({
  alt = "Dr. D. Y. Patil Deemed to be University",
  background = "light",
  height = 48,
  width = "auto",
  className,
  style,
}) {
  const src = background === "dark" ? darkBackgroundLogo : lightBackgroundLogo;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{
        display: "block",
        height,
        width,
        objectFit: "contain",
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
