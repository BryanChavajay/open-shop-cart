import React from "react";
import { Route, Routes } from "react-router-dom";

type Props = { children: React.ReactNode };

export const RoutesWithNotFound = ({ children }: Props) => {
  return (
    <Routes>
      {children}
      <Route path="*" element={NotFoundComponent()} />
    </Routes>
  );
};

const NotFoundComponent = () => {
  return (
    <article>
      <h2>404</h2>
      <p>Pagina no encontrada</p>
    </article>
  );
};
