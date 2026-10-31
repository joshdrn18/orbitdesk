import handler from "../../worker/index.js";

export async function onRequest(context) {
  return handler.fetch(context.request, context.env);
}
