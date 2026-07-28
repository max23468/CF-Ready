export default {
  fetch() {
    return new Response("test");
  },
} satisfies ExportedHandler<Env>;
