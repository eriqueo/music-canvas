// Shared by the static build and browser navigation.
export function routesFor(base='/'){
  return {draw:`${base}draw`,songs:`${base}songs`};
}
