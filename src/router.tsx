import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Outlet } from "react-router";
import { DatasheetProvider } from "./components/Datasheet";
import { Layout } from "./components/Layout";
import { MotionProvider } from "./components/motion";
import { Spinner, ToastProvider } from "./components/ui";
import { ConfirmProvider } from "./components/confirm";
import { RouteError } from "./components/RouteError";
import { AccountProvider } from "./lib/account";
import { BasketProvider } from "./lib/basket";
import { CatalogueProvider } from "./lib/catalogue";
import { CompareProvider } from "./lib/compare";
import localPages from "../data/local-pages.json";
import Home from "./pages/Home";

const Products = lazy(() => import("./pages/Products"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Compare = lazy(() => import("./pages/Compare"));
const Enquiry = lazy(() => import("./pages/Enquiry"));
const Learn = lazy(() => import("./pages/Learn"));
const LearnLesson = lazy(() => import("./pages/LearnLesson"));
const Tools = lazy(() => import("./pages/Tools"));
const Contact = lazy(() => import("./pages/Contact"));
const Faq = lazy(() => import("./pages/Faq"));
const Field = lazy(() => import("./pages/Field"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Privacy = lazy(() => import("./pages/Legal").then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import("./pages/Legal").then((m) => ({ default: m.Terms })));
const Local = lazy(() => import("./pages/Local"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminPrices = lazy(() => import("./pages/admin/Prices"));
const AdminProducts = lazy(() => import("./pages/admin/Products"));
const AdminProductEditor = lazy(() => import("./pages/admin/ProductEditor"));
const AdminCatalog = lazy(() => import("./pages/admin/Catalog"));
const AdminFieldPhotos = lazy(() => import("./pages/admin/FieldPhotos"));
const AdminEnquiries = lazy(() => import("./pages/admin/Enquiries"));
const AdminCustomers = lazy(() => import("./pages/admin/Customers"));
const AdminPerformance = lazy(() => import("./pages/admin/Performance"));
const AdminBonus = lazy(() => import("./pages/admin/Bonus"));
const AdminMyBonus = lazy(() => import("./pages/admin/Bonus").then((m) => ({ default: m.MyBonusPage })));
const AdminSettings = lazy(() => import("./pages/admin/Settings"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminQuotations = lazy(() => import("./pages/admin/Quotations"));
const Account = lazy(() => import("./pages/Account"));
const AccountReset = lazy(() => import("./pages/Account").then((m) => ({ default: m.AccountReset })));

function Page({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-muted">
          <Spinner />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function Providers() {
  return (
    <MotionProvider>
    <ToastProvider>
    <ConfirmProvider>
      <CatalogueProvider>
        <AccountProvider>
        <BasketProvider>
          <CompareProvider>
            <DatasheetProvider>
              <Outlet />
            </DatasheetProvider>
          </CompareProvider>
        </BasketProvider>
        </AccountProvider>
      </CatalogueProvider>
    </ConfirmProvider>
    </ToastProvider>
    </MotionProvider>
  );
}

export const router = createBrowserRouter([
  {
    element: <Providers />,
    children: [
      {
        element: <Layout />,
        errorElement: <RouteError />,
        children: [
          {
            // page errors show inside the site layout (header and menu stay usable)
            errorElement: <RouteError />,
            children: [
          { path: "/", element: <Home /> },
          { path: "/privacy", element: <Page><Privacy /></Page> },
          { path: "/terms", element: <Page><Terms /></Page> },
          { path: "/products", element: <Page><Products /></Page> },
          { path: "/category/:categorySlug", element: <Page><Products /></Page> },
          { path: "/products/:slug", element: <Page><ProductDetail /></Page> },
          { path: "/compare", element: <Page><Compare /></Page> },
          { path: "/enquiry", element: <Page><Enquiry /></Page> },
          { path: "/learn", element: <Page><Learn /></Page> },
          { path: "/learn/:lesson", element: <Page><LearnLesson /></Page> },
          { path: "/solar-tools", element: <Page><Tools /></Page> },
          { path: "/solar-tools/:tool", element: <Page><Tools /></Page> },
          { path: "/contact", element: <Page><Contact /></Page> },
          { path: "/faq", element: <Page><Faq /></Page> },
          { path: "/in-the-field", element: <Page><Field /></Page> },
          ...localPages.pages.map((p) => ({ path: `/${p.slug}`, element: <Page><Local page={p} /></Page> })),
          { path: "/account", element: <Page><Account /></Page> },
          { path: "/account/reset", element: <Page><AccountReset /></Page> },
          {
            path: "/admin",
            element: <Page><AdminLayout /></Page>,
            children: [
              { index: true, element: <Page><AdminDashboard /></Page> },
              { path: "prices", element: <Page><AdminPrices /></Page> },
              { path: "products", element: <Page><AdminProducts /></Page> },
              { path: "products/new", element: <Page><AdminProductEditor /></Page> },
              { path: "products/:id", element: <Page><AdminProductEditor /></Page> },
              { path: "catalogue", element: <Page><AdminCatalog /></Page> },
              { path: "field-photos", element: <Page><AdminFieldPhotos /></Page> },
              { path: "enquiries", element: <Page><AdminEnquiries /></Page> },
              { path: "quotations", element: <Page><AdminQuotations /></Page> },
              { path: "quotations/:id", element: <Page><AdminQuotations /></Page> },
              { path: "customers", element: <Page><AdminCustomers /></Page> },
              { path: "performance", element: <Page><AdminPerformance /></Page> },
              { path: "bonus", element: <Page><AdminBonus /></Page> },
              { path: "my-bonus", element: <Page><AdminMyBonus /></Page> },
              { path: "settings", element: <Page><AdminSettings /></Page> },
              { path: "users", element: <Page><AdminUsers /></Page> },
            ],
          },
          { path: "*", element: <Page><NotFound /></Page> },
            ],
          },
        ],
      },
    ],
  },
]);
