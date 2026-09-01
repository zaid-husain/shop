import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { TeamService } from "@/lib/domain/TeamService";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Users, UserPlus, Shield, Smartphone, Trash2, Clock, X, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SoundManager } from "@/lib/sounds";

export const Route = createFileRoute("/_authenticated/team")({
  component: TeamPage,
});

function TeamPage() {
  const { profile, role: currentUserRole } = useAuth();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteRole, setInviteRole] = useState<"owner" | "manager" | "staff">("staff");

  const isOwnerOrManager = currentUserRole === "owner" || currentUserRole === "manager";

  const { data: members, isLoading: loadingMembers } = useQuery({
    queryKey: ["team", "members"],
    queryFn: () => TeamService.getMembers(),
  });

  const { data: invitations, isLoading: loadingInvites } = useQuery({
    queryKey: ["team", "invitations"],
    queryFn: () => TeamService.getPendingInvitations(),
    enabled: isOwnerOrManager,
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      await TeamService.inviteUser(invitePhone, inviteRole);
    },
    onSuccess: () => {
      SoundManager.play("success");
      toast.success("Invitation sent successfully!");
      setInviteOpen(false);
      setInvitePhone("");
      setInviteRole("staff");
      queryClient.invalidateQueries({ queryKey: ["team", "invitations"] });
    },
    onError: (error: Error) => {
      SoundManager.play("error");
      toast.error(error.message || "Failed to send invitation");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => TeamService.cancelInvitation(id),
    onSuccess: () => {
      SoundManager.play("success");
      toast.success("Invitation cancelled");
      queryClient.invalidateQueries({ queryKey: ["team", "invitations"] });
    },
    onError: (error: Error) => {
      SoundManager.play("error");
      toast.error(error.message || "Failed to cancel invitation");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => TeamService.removeMember(id),
    onSuccess: () => {
      SoundManager.play("success");
      toast.success("Member removed");
      queryClient.invalidateQueries({ queryKey: ["team", "members"] });
    },
    onError: (error: Error) => {
      SoundManager.play("error");
      toast.error(error.message || "Failed to remove member");
    },
  });

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    inviteMutation.mutate();
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 safe-top flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Team Members
        </h1>
        {isOwnerOrManager && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <UserPlus className="w-4 h-4" />
                Invite
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] w-[90vw] rounded-2xl p-0 overflow-hidden border-0">
              <div className="bg-muted p-4 sm:p-6 pb-0 sm:pb-0">
                <DialogHeader>
                  <DialogTitle className="text-xl font-semibold">Invite Team Member</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground mt-2 mb-6">
                  They will join your shop automatically when they sign up with this number.
                </p>
              </div>
              <div className="p-4 sm:p-6 bg-card space-y-4">
                <form onSubmit={handleInviteSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Mobile Number (10 digits)</Label>
                    <div className="relative">
                      <Smartphone className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                      <Input
                        type="tel"
                        required
                        maxLength={10}
                        placeholder="9876543210"
                        className="pl-10 h-12 rounded-xl text-lg"
                        value={invitePhone}
                        onChange={(e) => setInvitePhone(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["owner", "manager", "staff"] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setInviteRole(r)}
                          className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors border ${
                            inviteRole === r
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
                          }`}
                        >
                          <span className="capitalize">{r}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="pt-4 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 rounded-xl h-12"
                      onClick={() => setInviteOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 rounded-xl h-12"
                      disabled={
                        inviteMutation.isPending || invitePhone.replace(/\D/g, "").length !== 10
                      }
                    >
                      {inviteMutation.isPending ? "Sending..." : "Send Invite"}
                    </Button>
                  </div>
                </form>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="p-4 max-w-lg mx-auto w-full space-y-6">
        {/* Active Members */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2 px-1">
            Active Members
          </h2>
          <div className="bg-card rounded-2xl shadow-floating divide-y divide-border overflow-hidden">
            {loadingMembers ? (
              <div className="p-8 text-center text-muted-foreground">Loading members...</div>
            ) : members?.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No members found.</div>
            ) : (
              members?.map((member) => (
                <div key={member.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {member.full_name}
                      {member.id === profile?.id && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary uppercase font-bold tracking-wider">
                          You
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <Smartphone className="w-3.5 h-3.5" />
                      {member.phone}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground font-medium capitalize">
                      {member.role}
                    </span>
                    {isOwnerOrManager && member.id !== profile?.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Remove ${member.full_name} from the shop?`)) {
                            removeMutation.mutate(member.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Pending Invitations */}
        {isOwnerOrManager && invitations && invitations.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2 px-1 mt-8">
              <Clock className="w-4 h-4" />
              Pending Invitations
            </h2>
            <div className="bg-card rounded-2xl shadow-floating divide-y divide-border overflow-hidden">
              {invitations.map((invite) => (
                <div
                  key={invite.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-orange-50/30 dark:bg-orange-950/20"
                >
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-orange-500" />
                      {invite.phone}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Invited as{" "}
                      <span className="capitalize font-medium text-foreground">{invite.role}</span>
                    </div>
                    {invite.join_code && (
                      <div className="mt-2 inline-flex items-center gap-2 bg-orange-100/50 dark:bg-orange-900/30 px-3 py-1.5 rounded-md border border-orange-200 dark:border-orange-900/50">
                        <span className="text-xs text-orange-700 dark:text-orange-400 font-medium">
                          Join Code:
                        </span>
                        <code className="text-sm font-bold tracking-widest text-orange-900 dark:text-orange-300">
                          {invite.join_code}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6 ml-1 hover:bg-orange-200 dark:hover:bg-orange-800"
                          onClick={() => {
                            navigator.clipboard.writeText(invite.join_code!);
                            toast.success("Join code copied to clipboard!");
                          }}
                        >
                          <Copy className="w-3.5 h-3.5 text-orange-700 dark:text-orange-400" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Cancel invitation for ${invite.phone}?`)) {
                        cancelMutation.mutate(invite.id);
                      }
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
