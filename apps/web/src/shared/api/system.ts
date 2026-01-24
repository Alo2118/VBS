import type { Role } from "@vbs/shared";
import { apiClient } from "./client";

export const fetchRoles = () => apiClient<{ data: Role[] }>("/system/roles");
