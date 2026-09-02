"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Users } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  businessUnit: string;
  status: string;
  lastLogin: string | null;
}

/**
 * A role is neither risk nor time, so it carries no colour. Elevated roles get
 * weight instead — the thing worth noticing in an access review is privilege,
 * and weight says that without competing with severity for the eye.
 */
const roleBadgeVariant: Record<string, string> = {
  SYSTEM_ADMIN: "bg-muted font-semibold text-foreground",
  SECURITY_ADMIN: "bg-muted font-semibold text-foreground",
  ADMIN: "bg-muted font-semibold text-foreground",
  SECURITY_MANAGER: "bg-muted text-foreground",
  MANAGER: "bg-muted text-foreground",
  SECURITY_ENGINEER: "bg-muted text-muted-foreground",
  ANALYST: "bg-muted text-muted-foreground",
  AUDITOR: "bg-muted text-muted-foreground",
  VIEWER: "bg-muted text-muted-foreground",
  READ_ONLY: "bg-muted text-muted-foreground",
};

export default function UsersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/v1/users");
      if (!res.ok) {
        setUsers([]);
        return;
      }
      const json = await res.json();
      setUsers(json.data || []);
    } catch {
      setUsers([]);
      setError(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await fetch(`/api/v1/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    } catch {
      // silently fail for now
    }
  };

  const filteredUsers = users.filter((user) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      user.name.toLowerCase().includes(q) ||
      user.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.users.title")}</h1>
        <p className="text-muted-foreground">
          {t("admin.users.administerAccounts")}
        </p>
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("admin.users.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : Boolean(error) ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          {t("admin.users.failedToLoad")}: {error}
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">{t("admin.users.noUsersFound")}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {search
              ? t("admin.users.tryAdjustingSearch")
              : t("admin.users.noUsersYet")}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.users.name")}</TableHead>
                <TableHead>{t("admin.users.email")}</TableHead>
                <TableHead>{t("admin.users.role")}</TableHead>
                <TableHead>{t("admin.users.businessUnit")}</TableHead>
                <TableHead>{t("admin.users.status")}</TableHead>
                <TableHead>{t("admin.users.lastLogin")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {String(user.name)}
                  </TableCell>
                  <TableCell>{String(user.email)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={
                          roleBadgeVariant[user.role] ||
                          "bg-muted text-muted-foreground"
                        }
                      >
                        {String(user.role)}
                      </Badge>
                      <Select
                        value={user.role}
                        onValueChange={(v) => {
                          if (!v) return;
                          handleRoleChange(user.id, v);
                        }}
                      >
                        <SelectTrigger className="w-[130px]" size="sm">
                          <SelectValue placeholder={t("admin.users.changeRole")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                          <SelectItem value="MANAGER">Manager</SelectItem>
                          <SelectItem value="ANALYST">Analyst</SelectItem>
                          <SelectItem value="VIEWER">Viewer</SelectItem>
                          <SelectItem value="AUDITOR">Auditor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell>{String(user.businessUnit || "--")}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        user.status === "ACTIVE" ? "default" : "secondary"
                      }
                    >
                      {user.status === "ACTIVE" ? t("admin.users.active") : t("admin.users.inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.lastLogin
                      ? new Date(user.lastLogin).toLocaleString()
                      : "--"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
