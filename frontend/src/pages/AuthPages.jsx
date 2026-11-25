import { SignIn, SignUp } from "@clerk/react";

const Shell = ({ children }) => (
  <div className="min-h-[80vh] grid lg:grid-cols-2">
    <div className="hidden lg:flex flex-col justify-end p-14 border-r border-zinc-900 bg-[radial-gradient(ellipse_at_bottom_left,rgba(176,203,31,0.18),transparent_60%)]">
      <p className="font-display text-7xl font-extrabold tracking-tighter leading-[0.9]">One deal.<br />One price.<br /><span className="text-[#B0CB1F]">Once.</span></p>
      <p className="mt-6 font-mono text-xs uppercase tracking-[0.25em] text-zinc-500">Sign in to grab today's deal</p>
    </div>
    <div className="flex items-center justify-center py-12 px-4">{children}</div>
  </div>
);

export const SignInPage = () => (
  <Shell><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" withSignUp /></Shell>
);

export const SignUpPage = () => (
  <Shell><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" /></Shell>
);
