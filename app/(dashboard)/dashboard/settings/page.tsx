import Link from "next/link";
import {
  ChevronRight,
  Lock,
  Settings,
  User,
  Users,
} from "lucide-react";

const settingsItems = [
  {
    title: "Profile",
    description: "Manage your profile information",
    href: "/dashboard/settings/profile",
    icon: User,
  },
  {
    title: "Security",
    description: "Change your account password",
    href: "/dashboard/settings/security",
    icon: Lock,
  },
  {
    title: "Users",
    description: "Create and manage employee accounts",
    href: "/dashboard/settings/users",
    icon: Users,
  },
  {
    title: "System",
    description: "Manage application preferences",
    href: "/dashboard/settings/system",
    icon: Settings,
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Settings
        </h1>

        <p className="text-sm text-gray-500">
          Manage your account and system settings.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {settingsItems.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center justify-between rounded-xl border bg-white p-5 transition hover:border-blue-300 hover:shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-lg bg-blue-50 p-3">
                  <Icon className="h-5 w-5 text-blue-600" />
                </div>

                <div>
                  <h2 className="font-semibold">
                    {item.title}
                  </h2>

                  <p className="text-sm text-gray-500">
                    {item.description}
                  </p>
                </div>
              </div>

              <ChevronRight className="h-5 w-5 text-gray-400 transition group-hover:translate-x-1" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}