# Lustrax Jewelries - Backend Infrastructure & Setup Guide

Welcome to the **Lustrax Jewelries** backend integration guide. This document provides a step-by-step roadmap to help you set up, configure, and maintain the Supabase-powered backend for our luxury jewelry platform.

---

## 1. Project Overview & Setup

### Prerequisites
Before starting, ensure you have the following installed on your machine:
- **Node.js** (v18 or higher)
- **Git**
- **Supabase CLI**: Install via npm: `npm install supabase --save-dev`
- **Accounts**: You will need free accounts for [Supabase](https://supabase.com), [Paystack](https://paystack.com), and [Resend](https://resend.com).

### Quick Start
1. **Clone the Repository**:
   ```bash
   git clone <your-repo-url>
   cd Lustrax-Jewelries
   ```
2. **Install Dependencies**:
   ```bash
   cd frontend
   npm install
   ```

---

## 2. Supabase CLI: Installation & Linking

The Supabase CLI is the command-center for your backend. Follow these steps to get it running:

1. **Install with NPX**: You don't need a global install. Just use `npx`:
   ```bash
   npx supabase --version
   ```
2. **Login to your account**:
   ```bash
   npx supabase login
   ```
   *Follow the link in your browser to generate an access token and paste it back into your terminal.*
3. **Initialize the Project**:
   ```bash
   npx supabase init
   ```
4. **Link to your Remote Project**:
   1. Go to your [Supabase Dashboard](https://supabase.com/dashboard/projects).
   2. Select your project and go to **Project Settings > General**.
   3. Copy the **Reference ID**.
   4. Run the link command:
      ```bash
      npx supabase link --project-ref your_project_id
      ```
      *You will be asked for your Database Password.*

---

## 3. Database Initialization

Follow these steps to build your tables and security:
1. **Open SQL Editor**: In the Supabase dashboard, click the SQL icon on the left sidebar.
2. **Execute Setup**: Copy the entire content of `supabase/schema/complete_setup.sql` into the editor and hit **Run**.
3. **Verify**: Check the "Table Editor" to ensure `profiles`, `products`, and `orders` are visible.

---

## 4. Edge Functions: Setup & Deployment

Edge Functions are where your secure logic (like payments) lives.

### Working with Functions locally
1. **Start the local server**:
   ```bash
   npx supabase functions serve
   ```
2. **Testing**: You can use tools like Postman or `curl` to send requests to `http://localhost:54321/functions/v1/name`.

### Managing Secrets (API Keys)
Edge Functions cannot see your `.env` file for security reasons. You must set "Secrets" on the Supabase server:
```bash
# Example: Setting the Paystack key
npx supabase secrets set PAYSTACK_SECRET_KEY=sk_test_...

# Example: Setting the Resend key
npx supabase secrets set RESEND_API_KEY=re_...
```

### Deploying to Production
When your code is ready for the world, push it to Supabase:
```bash
npx supabase functions deploy verify-payment
npx supabase functions deploy send-receipt
```

---

## 5. Catalog & Frontend Sync

### Manual Catalog Management
You can upload products directly from the **Lustrax Admin Dashboard**. When adding a new piece of jewelry, ensure you toggle the curation flags to control where it appears:
- **Featured**: Shows in the "Featured Collection" carousel.
- **New Release**: Shows in the "Latest Acquisitions" section.
- **Best Seller**: Priority placement in search results.

### Utility Scripts (`supabase/schema/`)
For maintenance and incremental updates, the following utilities are available:
- **`maintenance.sql`**: Run this to clean up abandoned 'pending' orders older than 24 hours.
- **`homepage_sync.sql` & `phone_integration.sql`**: These are incremental patches. Note that their logic is **already included** in the main `complete_setup.sql` for fresh installations.

---

## 4. Authentication System

The system uses **Supabase Auth** with a dual-role architecture:
- **Customer**: Standard users who can browse, wishlist, and purchase jewelry.
- **Admin**: Internal users who manage products and view financial audits.

### Setup Requirements
1. Go to **Authentication > Providers** in Supabase and enable **Email/Password**.
2. **Note on Roles**: The system automatically assigns the `user` role to new signups via a database trigger (`handle_new_user`). To promote a user to admin, manually update their role in the `profiles` table.

---

## 4. Edge Functions (The Logic Layer)

Edge Functions are server-side scripts that run in response to HTTP requests. They are used for tasks that require high security.

### 1. `verify-payment`
- **Purpose**: Validates that a Paystack transaction is legitimate.
- **Security**: It fetches the correct product prices from the database to ensure the customer hasn't manipulated the price on the frontend.
- **To Deploy**: `npx supabase functions deploy verify-payment`

### 2. `send-receipt`
- **Purpose**: Dispatches a premium "Acquisition Manifest" (HTML email) to the customer via **Resend**.
- **Localization**: Formats costs in Naira (₦) for a local luxury experience.
- **To Deploy**: `npx supabase functions deploy send-receipt`

---

## 5. Third-Party Integrations

### Paystack (Payments)
1. Register at [Paystack.com](https://paystack.com).
2. Grab your **Secret Key** and **Public Key** from the Settings dashboard.
3. Use the Public Key in your `.env` and the Secret Key as a Supabase Secret for `verify-payment`.

### Resend (Email Dispatch)
1. Register at [Resend.com](https://resend.com).
2. Generate an **API Key**.
3. Set this key as a Supabase Secret:
   ```bash
   npx supabase secrets set RESEND_API_KEY=your_key_here
   ```

---

## 6. Environment Variables

Create a `.env` file in the `frontend/` directory with the following:

```env
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_PAYSTACK_PUBLIC_KEY=your_paystack_key
```

> [!WARNING]
> Never expose your `SERVICE_ROLE_KEY` or `DATABASE_PASSWORD` in the frontend `.env` file. These are high-security credentials.

---

## 7. Troubleshooting & Best Practices

### Common Issues
- **CORS Errors**: Ensure your Edge Functions have the correct `Access-Control-Allow-Origin` headers (included by default in our project setup).
- **RLS Violations**: If data isn't showing up, check if you've enabled Row Level Security but haven't created a policy for the current user role.
- **Missing Secrets**: If an Edge Function fails, check your Supabase Logs to see if an environment variable (like `PAYSTACK_SECRET_KEY`) is missing.

### Maintenance
- **Schema Updates**: Always use the `complete_setup.sql` as your baseline. If you need to make changes, update this file so it remains the "Single Source of Truth."
- **Performance**: We've optimized the Admin Dashboard to use heavy-duty count queries. Avoid fetching entire tables whenever possible.

---

*Lustrax Jewelries - Defining local luxury through secure infrastructure.*
