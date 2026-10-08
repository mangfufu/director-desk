export default {
  server: {
    watch: {
      // Build outputs and isolated test profiles are not application source.
      ignored: ['**/tmp/**', '**/.audit/**', '**/release/**', '**/.local/**'],
    },
  },
};
