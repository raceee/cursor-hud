"use strict";

(function (root) {
  function variantLabel(model, variant) {
    const base = model.displayName || model.id;
    if (variant.displayName && variant.displayName !== base) return variant.displayName;
    const extras = (variant.params || [])
      .filter((param) => param && param.value && param.value !== "false")
      .map((param) => {
        if (param.displayName) return param.displayName;
        if (param.value && param.value !== "true") return param.value;
        return String(param.id || "").replace(/(^|[_-])(\w)/g, (_all, _sep, char) =>
          char.toUpperCase()
        );
      })
      .filter(Boolean);
    if (extras.length) return `${base} ${extras.join(" ")}`;
    return variant.displayName || base;
  }

  function flattenModelOptions(models) {
    if (!Array.isArray(models)) return [];
    const options = [];
    for (const model of models) {
      if (!model || typeof model !== "object" || !model.id) continue;
      const variants = Array.isArray(model.variants) ? model.variants : [];
      if (!variants.length) {
        options.push({
          id: String(model.id),
          params: [],
          label: model.displayName || model.id,
          description: model.description || "",
        });
        continue;
      }
      for (const variant of variants) {
        if (!variant || typeof variant !== "object") continue;
        options.push({
          id: String(model.id),
          params: Array.isArray(variant.params) ? variant.params : [],
          label: variantLabel(model, variant),
          description: variant.description || model.description || "",
        });
      }
    }
    return options;
  }

  function optionKey(option) {
    if (!option || !option.id) return "";
    const params = (Array.isArray(option.params) ? option.params : [])
      .map((param) => `${param.id}=${param.value}`)
      .sort()
      .join(",");
    return params ? `${option.id}|${params}` : option.id;
  }

  function sameParams(a, b) {
    return optionKey({ id: "x", params: a }) === optionKey({ id: "x", params: b });
  }

  function modelSelection(config) {
    const id =
      config && typeof config.model === "string" && config.model.trim()
        ? config.model.trim()
        : "composer-2.5";
    const model = { id };
    if (config && Array.isArray(config.modelParams) && config.modelParams.length) {
      model.params = config.modelParams;
    }
    return model;
  }

  function findModelOption(options, modelId, params) {
    const list = Array.isArray(options) ? options : [];
    const wanted = optionKey({ id: modelId, params });
    return (
      list.find((option) => optionKey(option) === wanted) ||
    list.find((option) => option.id === modelId && sameParams(option.params, params || [])) ||
    list.find((option) => option.id === modelId) ||
    list[0] ||
    null
    );
  }

  const api = { flattenModelOptions, optionKey, findModelOption, modelSelection };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.HudModels = api;
})(typeof window !== "undefined" ? window : globalThis);
