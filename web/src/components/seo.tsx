import { useEffect } from "react";
import { PUBLIC_SITE_URL } from "@game-finder/shared";

function setMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
}

export function Seo({
  title,
  description,
  path,
  image,
  type = "website",
  noIndex = false,
  jsonLd,
}: {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  type?: "website" | "article";
  noIndex?: boolean;
  jsonLd?: object;
}) {
  const jsonLdText = jsonLd
    ? JSON.stringify(jsonLd).replace(/</g, "\\u003c")
    : null;

  useEffect(() => {
    const canonical = `${PUBLIC_SITE_URL}${path}`;
    const socialImage = image ? new URL(image, PUBLIC_SITE_URL).toString() : null;

    document.title = title;
    setMeta('meta[name="description"]', { name: "description", content: description });
    setMeta('meta[name="robots"]', {
      name: "robots",
      content: noIndex ? "noindex, nofollow" : "index, follow",
    });
    setMeta('meta[property="og:title"]', { property: "og:title", content: title });
    setMeta('meta[property="og:site_name"]', {
      property: "og:site_name",
      content: "玩什么 PlayWhat",
    });
    setMeta('meta[property="og:description"]', {
      property: "og:description",
      content: description,
    });
    setMeta('meta[property="og:type"]', { property: "og:type", content: type });
    setMeta('meta[property="og:url"]', { property: "og:url", content: canonical });
    if (socialImage) {
      setMeta('meta[property="og:image"]', {
        property: "og:image",
        content: socialImage,
      });
    } else {
      document.head.querySelector('meta[property="og:image"]')?.remove();
    }
    setMeta('meta[name="twitter:card"]', {
      name: "twitter:card",
      content: "summary_large_image",
    });
    setMeta('meta[name="twitter:title"]', {
      name: "twitter:title",
      content: title,
    });
    setMeta('meta[name="twitter:description"]', {
      name: "twitter:description",
      content: description,
    });
    if (socialImage) {
      setMeta('meta[name="twitter:image"]', {
        name: "twitter:image",
        content: socialImage,
      });
    } else {
      document.head.querySelector('meta[name="twitter:image"]')?.remove();
    }

    let canonicalLink = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.rel = "canonical";
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = canonical;

    const existingJsonLd = document.getElementById("page-json-ld");
    if (jsonLdText) {
      const script = existingJsonLd ?? document.createElement("script");
      script.id = "page-json-ld";
      script.setAttribute("type", "application/ld+json");
      script.textContent = jsonLdText;
      if (!existingJsonLd) document.head.appendChild(script);
    } else {
      existingJsonLd?.remove();
    }
  }, [description, image, jsonLdText, noIndex, path, title, type]);

  return null;
}
