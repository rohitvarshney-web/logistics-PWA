// app/dashboard/page.tsx
export default function DashboardPage() {
  return (
    <main className="container" style={{ maxWidth: 800 }}>
      <h1>Dashboard</h1>
      <p className="label">Welcome! You’re logged in.</p>
      <form action="/api/auth/logout" method="post" style={{ marginTop: 16 }}>
        <button className="btn">Log out</button>
      </form>
    </main>
  );
}
