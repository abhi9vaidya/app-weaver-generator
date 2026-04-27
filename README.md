# App Weaver - Dynamic Application Generator Engine

App Weaver is a powerful, low-code platform that converts structured JSON configurations into fully functional, data-driven web applications. It dynamically generates Frontend UIs, Backend APIs, and Database schemas without any hardcoded logic.

## 🚀 Key Features

- **Dynamic UI Runtime**: Renders forms, tables, and dashboards on-the-fly based on JSON entity definitions.
- **Node.js Engine**: A custom backend service that provides dynamic CRUD endpoints and validation for any generated app.
- **Resilient Config Parsing**: Handles imperfect, inconsistent, or missing fields gracefully using a normalization layer.
- **Customizable Auth UI**: A config-driven authentication system that adapts its branding and providers (Email/Google) instantly.
- **Advanced CSV Mapping**: Upload any CSV and map headers to your generated entity fields via an interactive UI.
- **Mobile-Ready Experience**: A premium, responsive design built with Tailwind CSS and Radix UI.
- **Localization**: Native support for multiple languages (English, Spanish, Hindi, etc.) defined in the config.
- **Event-Driven Notifications**: System-wide notifications triggered by dynamic API actions.

## 🛠️ Tech Stack

- **Frontend**: React (Vite), Tailwind CSS, Shadcn UI, Lucide, Sonner (Toasts)
- **Backend**: Node.js, Express, TypeScript, Zod (Validation)
- **Database/Auth**: Supabase (PostgreSQL)

## 🏗️ Architecture

App Weaver follows a **Metadata-Driven Architecture**:

1. **Config Definition**: The user defines the app's structure (Entities, Fields, Views, Auth) in a central JSON object.
2. **Normalization**: The `config-forge` layer validates and repairs the JSON to ensure runtime stability.
3. **Dynamic Rendering**: React components map the configuration to specific UI layouts.
4. **Backend Proxy**: The Node.js engine receives requests, validates data against the schema metadata, and interacts with the database.

## 🏃 Getting Started

### Prerequisites

- Node.js (v18+)
- Supabase Account (for PostgreSQL and Auth)

### 1. Clone & Install

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
```

### 2. Configuration

Create a `.env` file in the root and in the `server/` directory:

**Root `.env`**:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**`server/.env`**:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
PORT=3001
```

### 3. Run Locally

```bash
# Start backend engine (from /server)
npm run dev

# Start frontend dashboard (from root)
npm run dev
```

## 📄 License

MIT
