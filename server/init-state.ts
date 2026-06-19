export const initState = {
  // True dal boot fino a quando TUTTE le fasi (migration, seed, scheduler) sono
  // complete. Il gate /api/* in server/index.ts usa questo flag per il 503.
  initializing: true,
  // True non appena le migration sono applicate: schema + tabella session pronti.
  // Permette al gate di lasciar passare le rotte auth essenziali (login, me,
  // logout) durante la finestra di init, prima che initializing diventi false.
  dbReady: false,
};
