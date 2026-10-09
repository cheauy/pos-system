"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  LANGUAGE_COOKIE,
  LANGUAGE_STORAGE_KEY,
  formatUiText,
  translateUiText,
  type AppLanguage,
} from "@/lib/i18n/translations";

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (text: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const TRANSLATABLE_ATTRIBUTES = [
  "placeholder",
  "title",
  "aria-label",
  "alt",
  "label",
] as const;

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "CODE",
  "PRE",
  "TEXTAREA",
]);

function shouldSkipElement(element: Element | null) {
  if (!element) return false;

  if (SKIP_TAGS.has(element.tagName)) {
    return true;
  }

  return Boolean(
    element.closest(
      '[data-i18n-ignore="true"], [contenteditable="true"]',
    ),
  );
}

// Streamed server HTML hydrates after this provider. Translating it first makes
// the DOM text differ from React's, so React discards and re-renders the tree
// (hydration error, lost first clicks). Only translate nodes React already owns.
function reactOwns(element: Element | null) {
  return !element || Object.keys(element).some((key) => key.startsWith("__reactFiber$"));
}

export default function LanguageProvider({
  initialLanguage,
  children,
}: {
  initialLanguage: AppLanguage;
  children: ReactNode;
}) {
  const [language, setLanguageState] =
    useState<AppLanguage>(initialLanguage);

  const textOriginals = useRef(new WeakMap<Text, string>());
  const attributeOriginals = useRef(
    new WeakMap<Element, Map<string, string>>(),
  );
  const applying = useRef(false);

  const setLanguage = useCallback((next: AppLanguage) => {
    setLanguageState(next);

    if (typeof window !== "undefined") {
      try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next); } catch { /* The cookie remains the language source of truth. */ }

      const host = window.location.hostname.toLowerCase();
      const sharedDomain =
        host === "tenh-pos.com" || host.endsWith(".tenh-pos.com")
          ? "; domain=.tenh-pos.com"
          : "";

      document.cookie = `${LANGUAGE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax${sharedDomain}`;
      document.documentElement.lang = next;
      document.documentElement.dataset.language = next;
    }
  }, []);

  const t = useCallback(
    (text: string) => translateUiText(text, language),
    [language],
  );

  useEffect(() => {
    // The server cookie is the source of truth so the preference follows the
    // owner between tenh-pos.com and business subdomains.
    try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, initialLanguage); } catch { /* Cookie-backed language still works without device storage. */ }
    document.documentElement.lang = initialLanguage;
    document.documentElement.dataset.language = initialLanguage;
  }, [initialLanguage]);

  useEffect(() => {
    const waiting = new Map<Node, number>();
    let timer: ReturnType<typeof setTimeout> | undefined;

    function ready(node: Node, element: Element | null) {
      const tries = waiting.get(node) ?? 0;
      // ponytail: DOM React never hydrates is translated after ~3 s; poll is fine for a handful of nodes.
      if (reactOwns(element) || tries >= 20) {
        waiting.delete(node);
        return true;
      }
      waiting.set(node, tries + 1);
      timer ??= setTimeout(retry, 150);
      return false;
    }

    function retry() {
      timer = undefined;
      for (const node of [...waiting.keys()]) {
        if (!node.isConnected) waiting.delete(node);
        else if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text);
        else translateAttributes(node as Element);
      }
    }

    function translateTextNode(node: Text) {
      const parent = node.parentElement;
      if (shouldSkipElement(parent)) return;
      if (!ready(node, parent)) return;

      const current = node.nodeValue ?? "";
      if (!current.trim()) return;

      if (language === "en") {
        const original = textOriginals.current.get(node);
        if (original !== undefined && current !== original && current === translateUiText(original, "km")) {
          applying.current = true;
          node.nodeValue = original;
          applying.current = false;
        } else {
          textOriginals.current.set(node, current);
        }
        return;
      }

      let original = textOriginals.current.get(node);

      if (original === undefined) {
        original = current;
        textOriginals.current.set(node, original);
      } else {
        const expectedTranslation = translateUiText(
          original,
          "km",
        );

        // React may have replaced a dynamic value. Treat a new English value
        // as the new source string before translating it again.
        if (
          current !== original &&
          current !== expectedTranslation &&
          !/[\u1780-\u17ff]/.test(current)
        ) {
          original = current;
          textOriginals.current.set(node, original);
        }
      }

      const translated = translateUiText(original, "km");
      if (translated !== current) {
        applying.current = true;
        node.nodeValue = translated;
        applying.current = false;
      }
    }

    function translateAttributes(element: Element) {
      if (shouldSkipElement(element)) return;
      if (!ready(element, element)) return;

      let originals = attributeOriginals.current.get(element);
      if (!originals) {
        originals = new Map<string, string>();
        attributeOriginals.current.set(element, originals);
      }

      for (const attribute of TRANSLATABLE_ATTRIBUTES) {
        const template = element.getAttribute(`data-i18n-template-${attribute}`);
        const valuesJson = element.getAttribute(`data-i18n-values-${attribute}`);
        if (template && valuesJson) {
          try {
            const values: unknown = JSON.parse(valuesJson);
            if (Array.isArray(values)) {
              const translated = formatUiText(translateUiText(template, language), values);
              if (element.getAttribute(attribute) !== translated) {
                applying.current = true;
                element.setAttribute(attribute, translated);
                applying.current = false;
              }
              continue;
            }
          } catch { /* Invalid template metadata uses the ordinary attribute translation. */ }
        }
        if ((element.getAttribute("data-i18n-ignore-attributes") ?? "").split(/\s+/).includes(attribute)) continue;
        if (!element.hasAttribute(attribute)) continue;

        const current = element.getAttribute(attribute) ?? "";
        let original = originals.get(attribute);

        if (language === "en") {
          if (original !== undefined && current !== original && current === translateUiText(original, "km")) {
            applying.current = true;
            element.setAttribute(attribute, original);
            applying.current = false;
          } else {
            originals.set(attribute, current);
          }
          continue;
        }

        if (original === undefined) {
          original = current;
          originals.set(attribute, original);
        } else {
          const expectedTranslation = translateUiText(
            original,
            "km",
          );
          if (
            current !== original &&
            current !== expectedTranslation &&
            !/[\u1780-\u17ff]/.test(current)
          ) {
            original = current;
            originals.set(attribute, original);
          }
        }

        const translated = translateUiText(original, "km");
        if (translated !== current) {
          applying.current = true;
          element.setAttribute(attribute, translated);
          applying.current = false;
        }
      }
    }

    function walk(root: Node) {
      if (root.nodeType === Node.TEXT_NODE) {
        translateTextNode(root as Text);
        return;
      }

      if (root.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const element = root as Element;
      if (shouldSkipElement(element)) return;

      translateAttributes(element);

      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      );

      let node = walker.nextNode();
      while (node) {
        if (node.nodeType === Node.TEXT_NODE) {
          translateTextNode(node as Text);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          translateAttributes(node as Element);
        }
        node = walker.nextNode();
      }
    }

    walk(document.body);

    const observer = new MutationObserver((mutations) => {
      if (applying.current) return;

      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          translateTextNode(mutation.target as Text);
          continue;
        }

        if (mutation.type === "attributes") {
          translateAttributes(mutation.target as Element);
          continue;
        }

        for (const added of mutation.addedNodes) {
          walk(added);
        }
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES, ...TRANSLATABLE_ATTRIBUTES.flatMap(attribute => [`data-i18n-template-${attribute}`, `data-i18n-values-${attribute}`]), "data-i18n-ignore-attributes"],
    });

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [language]);

  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error(
      "useLanguage must be used inside LanguageProvider.",
    );
  }

  return context;
}
