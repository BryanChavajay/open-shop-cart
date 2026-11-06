import React from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import { ROOT } from "@utils/routes";

type Props = {
  children: React.ReactNode;
  to: string | null;
};

export const RoutesWithRedirect = ({ children, to = null }: Props) => {
  return (
    <Routes>
      {children}
      <Route path="*" element={<Navigate to={to || ROOT} />} />
    </Routes>
  );
};
