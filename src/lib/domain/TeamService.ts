import { sb } from "@/lib/db";
import { type Role } from "@/lib/auth-context";

export interface ShopInvitation {
  id: string;
  shop_id: string;
  phone: string;
  role: Role;
  status: "pending" | "accepted" | "cancelled" | "expired";
  invited_by: string;
  join_code?: string;
  expires_at: string;
  created_at: string;
}

export class TeamService {
  /**
   * Validate a join code
   */
  static async validateJoinCode(
    phone: string,
    code: string,
  ): Promise<{ valid: boolean; user_exists: boolean }> {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) throw new Error("Invalid mobile number");

    const { data, error } = await sb.rpc("validate_join_code", {
      p_phone: digits,
      p_code: code.trim().toUpperCase(),
    });
    if (error) throw error;
    return data as { valid: boolean; user_exists: boolean };
  }

  /**
   * Accept an invitation (for already authenticated users)
   */
  static async acceptInvitation(code: string) {
    const { data, error } = await sb.rpc("accept_invitation", {
      p_code: code.trim().toUpperCase(),
    });
    if (error) throw error;
    return data;
  }
  /**
   * Invite a new user to the current shop.
   */
  static async inviteUser(phone: string, role: NonNullable<Role>) {
    // 10-digit validation
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) throw new Error("Enter a valid 10-digit mobile number");

    const { data, error } = await sb.rpc("invite_user", {
      p_phone: digits,
      p_role: role,
    });

    if (error) {
      if (error.message.includes("already a member")) {
        throw new Error("This mobile number is already a member of the shop.");
      }
      throw error;
    }
    return data;
  }

  /**
   * Cancel a pending invitation.
   */
  static async cancelInvitation(inviteId: string) {
    const { data, error } = await sb.rpc("cancel_invitation", {
      p_invite_id: inviteId,
    });
    if (error) throw error;
    return data;
  }

  /**
   * Remove a member from the shop.
   */
  static async removeMember(userId: string) {
    const { data, error } = await sb.rpc("remove_member", {
      p_user_id: userId,
    });
    if (error) {
      if (error.message.includes("Cannot remove yourself")) {
        throw new Error("You cannot remove yourself.");
      }
      if (error.message.includes("Managers cannot remove owners")) {
        throw new Error("Managers cannot remove owners.");
      }
      throw error;
    }
    return data;
  }

  /**
   * Get all active members for the current shop.
   */
  static async getMembers() {
    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
      sb
        .from("profiles")
        .select("id, full_name, phone, created_at")
        .order("created_at", { ascending: true }),
      sb.from("user_roles").select("user_id, role"),
    ]);

    if (pErr) throw pErr;
    if (rErr) throw rErr;

    const roleMap = new Map((roles || []).map((r) => [r.user_id, r.role]));

    return (profiles || []).map(
      (p: { id: string; full_name: string; phone: string; created_at: string }) => ({
        id: p.id,
        full_name: p.full_name,
        phone: p.phone,
        created_at: p.created_at,
        role: (roleMap.get(p.id) ?? "staff") as Role,
      }),
    );
  }

  /**
   * Get all pending invitations for the current shop.
   */
  static async getPendingInvitations() {
    const { data, error } = await sb
      .from("shop_invitations")
      .select("*")
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data as ShopInvitation[];
  }
}
