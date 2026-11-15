export function resolveModel(models, selection) {
  return selection === 'latest-terra'
    ? models.find(model => /terra/i.test(model.slug))
    : models.find(model => model.slug === selection);
}
