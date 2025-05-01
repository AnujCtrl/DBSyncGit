"use client";

import { useEffect, useState, useRef } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { SQLEditor } from "@/components/ui/sql-editor";
import {
  Command,
  CommandList,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

const ENVIRONMENTS = ["qa", "production", "enterprise"];
const API_BASE = "http://127.0.0.1:8000/api/v1";

// Utility function to check if all tenant DBs are selected (all DBs except router)
const isAllTenantsSelected = (
  selectedDBs: string[],
  allDBs: string[]
): boolean => {
  // If router is the only DB available, or there are no DBs, return false
  if (allDBs.length <= 1) return false;

  // Check if all DBs except router are selected
  const tenantsDBs = allDBs.filter((db) => db !== "router");
  const selectedTenantsDBs = selectedDBs.filter((db) => db !== "router");

  // If the selected tenants count matches all available tenants count
  return (
    selectedTenantsDBs.length === tenantsDBs.length &&
    tenantsDBs.every((db) => selectedTenantsDBs.includes(db))
  );
};

// Types matching backend models
type SQLResponse = {
  status: string;
  rowcount: number;
  rows: Record<string, string | number | boolean | null>[];
  column_names: string[];
  error_message?: string;
};

type SQLAlteration = {
  environment: string;
  altered_sql: string;
  timestamp: string;
  altered_by: string;
  reason: string;
};

type SQLChange = {
  change_id: string;
  sql_content: string;
  original_sql_content: string;
  description: string;
  environment: string;
  target_databases: string[];
  applied_to: string[];
  sql_responses: Record<string, SQLResponse>;
  timestamp: string;
  created_by: string;
  is_rolled_back?: boolean;
  rollback_sql?: string;
  rollback_responses?: Record<string, SQLResponse>;
  alterations?: SQLAlteration[];
};

function fetchWithAuth(
  url: string,
  options: Record<string, unknown> = {},
  username?: string,
  password?: string
) {
  options = typeof options === "object" && options !== null ? options : {};
  if (!username || !password) throw new Error("Not authenticated");
  const headers = Object.assign({}, options.headers ?? {}, {
    Authorization: `Basic ${btoa(`${username}:${password}`)}`,
    "Content-Type": "application/json",
  });
  console.log(url);
  return fetch(url, { ...options, headers });
}

export default function Home() {
  const [activeEnv, setActiveEnv] = useState("qa");
  const [databases, setDatabases] = useState<Record<string, string[]>>({});
  const [selectedDBs, setSelectedDBs] = useState<Record<string, string[]>>({
    qa: [],
    production: [],
    enterprise: [],
  });
  const [pendingChanges, setPendingChanges] = useState<
    Record<string, SQLChange[]>
  >({});
  const [allChanges, setAllChanges] = useState<Record<string, SQLChange[]>>({});
  const [showCreateDialog, setShowCreateDialog] = useState<boolean>(false);
  const [createSQL, setCreateSQL] = useState<string>("");
  const [createDesc, setCreateDesc] = useState<string>("");
  const [createRollback, setCreateRollback] = useState<string>("");
  const [createLoading, setCreateLoading] = useState<boolean>(false);
  const [applyLoading, setApplyLoading] = useState<string>("");
  const [alterDialog, setAlterDialog] = useState<{
    open: boolean;
    change: SQLChange | null;
  }>({ open: false, change: null });
  const [alterSQL, setAlterSQL] = useState<string>("");
  const [alterReason, setAlterReason] = useState<string>("");
  const [popup, setPopup] = useState<{
    open: boolean;
    title: string;
    desc: string;
  }>({ open: false, title: "", desc: "" });
  const [rollbackLoading, setRollbackLoading] = useState<string>("");

  // Auth state
  const [auth, setAuth] = useState<{
    username: string;
    password: string;
    isLoggedIn: boolean;
  }>({ username: "", password: "", isLoggedIn: false });
  const [showLogin, setShowLogin] = useState(true);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Fetch DBs and changes for the active environment
  useEffect(() => {
    if (!auth.isLoggedIn || !activeEnv) return; // Also check if activeEnv is set

    const env = activeEnv; // Use the current activeEnv

    // Fetch Databases for the active env
    fetchWithAuth(
      `${API_BASE}/databases/${env}`,
      {},
      auth.username,
      auth.password
    )
      .then((r) => {
        if (r.status === 400) {
          r.json().then((data) => {
            if (data.detail === `Environment ${env} is not available`) {
              // Set empty array for this specific env, don't clear others
              setDatabases((prev) => ({ ...prev, [env]: [] }));
            }
          });
        } else if (r.ok) {
          // Check if response is ok
          r.json().then((data) => {
            console.log(data);
            setDatabases((prev) => ({ ...prev, [env]: data }));
          });
        } else {
          // Handle potential errors like 500 etc.
          console.error(`Failed to fetch databases for ${env}: ${r.status}`);
          setDatabases((prev) => ({ ...prev, [env]: [] })); // Set to empty on error
        }
      })
      .catch((error) => {
        console.error(`Error fetching databases for ${env}:`, error);
        setDatabases((prev) => ({ ...prev, [env]: [] })); // Set to empty on fetch error
      });

    // Fetch Pending Changes for the active env
    fetchWithAuth(
      `${API_BASE}/changes/${env}/pending`,
      {},
      auth.username,
      auth.password
    )
      .then((r) => {
        if (r.status === 400) {
          return r.json().then((data) => {
            if (data.detail === `Environment ${env} is not available`) {
              return [];
            }
            throw new Error(data.detail || "Failed to fetch pending changes");
          });
        }
        if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);
        return r.json();
      })
      .then((data) =>
        setPendingChanges((prev) => ({
          ...prev,
          [env]: Array.isArray(data) ? data : [], // Ensure it's always an array
        }))
      )
      .catch((error) => {
        console.error(`Error fetching pending changes for ${env}:`, error);
        setPendingChanges((prev) => ({ ...prev, [env]: [] })); // Set to empty on error
      });

    // Fetch All Changes for the active env
    fetchWithAuth(
      `${API_BASE}/changes/${env}`,
      {},
      auth.username,
      auth.password
    )
      .then((r) => {
        if (r.status === 400) {
          return r.json().then((data) => {
            if (data.detail === `Environment ${env} is not available`) {
              return [];
            }
            throw new Error(data.detail || "Failed to fetch all changes");
          });
        }
        if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);
        return r.json();
      })
      .then((data) =>
        setAllChanges((prev) => ({
          ...prev,
          [env]: Array.isArray(data) ? data : [], // Ensure it's always an array
        }))
      )
      .catch((error) => {
        console.error(`Error fetching all changes for ${env}:`, error);
        setAllChanges((prev) => ({ ...prev, [env]: [] })); // Set to empty on error
      });

    // Add activeEnv to the dependency array
  }, [auth.isLoggedIn, auth.username, auth.password, activeEnv]);

  // Create new change (QA only)
  const handleCreateChange = async () => {
    setCreateLoading(true);
    try {
      const res = await fetchWithAuth(
        `${API_BASE}/changes`,
        {
          method: "POST",
          body: JSON.stringify({
            sql_content: createSQL,
            description: createDesc,
            target_databases: selectedDBs["qa"],
            environment: "qa",
            created_by: auth.username,
            rollback_sql: createRollback,
          }),
        },
        auth.username,
        auth.password
      );
      if (!res.ok) throw new Error(await res.text());
      setPopup({
        open: true,
        title: "Success",
        desc: "Change created successfully.",
      });
      // Also apply the change to the active environment
      await handleApplyChange(activeEnv, await res.json());
      setShowCreateDialog(false);
      setCreateSQL("");
      setCreateDesc("");
      setCreateRollback("");
      // Refresh changes
      fetchWithAuth(
        `${API_BASE}/changes/qa/pending`,
        {},
        auth.username,
        auth.password
      )
        .then((r) => r.json())
        .then((data) => setPendingChanges((prev) => ({ ...prev, qa: data })));
      fetchWithAuth(`${API_BASE}/changes/qa`, {}, auth.username, auth.password)
        .then((r) => r.json())
        .then((data) => setAllChanges((prev) => ({ ...prev, qa: data })));
    } catch (e: unknown) {
      setPopup({
        open: true,
        title: "Error",
        desc: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setCreateLoading(false);
    }
  };

  // Apply change
  const handleApplyChange = async (env: string, change: SQLChange) => {
    setApplyLoading(change.change_id);
    try {
      const res = await fetchWithAuth(
        `${API_BASE}/changes/${change.change_id}/apply/${env}`,
        {
          method: "POST",
          body: JSON.stringify(selectedDBs[env]),
        },
        auth.username,
        auth.password
      );
      if (!res.ok) throw new Error(await res.text());
      setPopup({
        open: true,
        title: "Success",
        desc: "Change applied successfully.",
      });
      // Refresh changes
      fetchWithAuth(
        `${API_BASE}/changes/${env}/pending`,
        {},
        auth.username,
        auth.password
      )
        .then((r) => r.json())
        .then((data) =>
          setPendingChanges((prev) => ({ ...prev, [env]: data }))
        );
      fetchWithAuth(
        `${API_BASE}/changes/${env}`,
        {},
        auth.username,
        auth.password
      )
        .then((r) => r.json())
        .then((data) => setAllChanges((prev) => ({ ...prev, [env]: data })));
    } catch (e: unknown) {
      setPopup({
        open: true,
        title: "Error",
        desc: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setApplyLoading("");
    }
  };

  // Alter change
  const handleAlterChange = async () => {
    if (!alterDialog.change) return;
    try {
      const res = await fetchWithAuth(
        `${API_BASE}/changes/${alterDialog.change.change_id}/alter?environment=${activeEnv}`,
        {
          method: "POST",
          body: JSON.stringify({
            environment: activeEnv,
            altered_sql: alterSQL,
            altered_by: auth.username,
            reason: alterReason,
          }),
        },
        auth.username,
        auth.password
      );
      if (!res.ok) throw new Error(await res.text());
      setPopup({
        open: true,
        title: "Success",
        desc: "Change altered successfully.",
      });
      setAlterDialog({ open: false, change: null });
      setAlterSQL("");
      setAlterReason("");
      // Refresh changes
      fetchWithAuth(
        `${API_BASE}/changes/${activeEnv}/pending`,
        {},
        auth.username,
        auth.password
      )
        .then((r) => r.json())
        .then((data) =>
          setPendingChanges((prev) => ({ ...prev, [activeEnv]: data }))
        );
      fetchWithAuth(
        `${API_BASE}/changes/${activeEnv}`,
        {},
        auth.username,
        auth.password
      )
        .then((r) => r.json())
        .then((data) =>
          setAllChanges((prev) => ({ ...prev, [activeEnv]: data }))
        );
    } catch (e: unknown) {
      setPopup({
        open: true,
        title: "Error",
        desc: e instanceof Error ? e.message : String(e),
      });
    }
  };

  // Login handler
  const handleLogin = () => {
    const username = usernameRef.current?.value || "";
    const password = passwordRef.current?.value || "";
    setAuth({ username, password, isLoggedIn: true });
    setShowLogin(false);
  };

  const handleLogout = () => {
    setAuth({ username: "", password: "", isLoggedIn: false });
    setShowLogin(true);
  };

  // Rollback change
  const handleRollbackChange = async (env: string, change: SQLChange) => {
    setRollbackLoading(change.change_id);
    try {
      const res = await fetchWithAuth(
        `${API_BASE}/changes/${change.change_id}/rollback/${env}`,
        {
          method: "POST",
          body: JSON.stringify({ rolled_back_by: auth.username }), // Assuming backend needs who rolled back
        },
        auth.username,
        auth.password
      );
      if (!res.ok) throw new Error(await res.text());
      setPopup({
        open: true,
        title: "Success",
        desc: "Change rolled back successfully.",
      });
      // Refresh changes for the specific environment
      fetchWithAuth(
        `${API_BASE}/changes/${env}`,
        {},
        auth.username,
        auth.password
      )
        .then((r) => {
          if (r.status === 400) {
            return r.json().then((data) => {
              if (data.detail === `Environment ${env} is not available`) {
                return [];
              }
              throw new Error(data.detail || "Failed to fetch changes");
            });
          }
          if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);
          return r.json();
        })
        .then((data) =>
          setAllChanges((prev) => ({
            ...prev,
            [env]: Array.isArray(data) ? data : [],
          }))
        )
        .catch((e) => {
          setPopup({
            open: true,
            title: "Error refreshing changes",
            desc: e instanceof Error ? e.message : String(e),
          });
        });
      // Also refresh pending changes, as rollback might affect it
      fetchWithAuth(
        `${API_BASE}/changes/${env}/pending`,
        {},
        auth.username,
        auth.password
      )
        .then((r) => {
          if (r.status === 400) {
            return r.json().then((data) => {
              if (data.detail === `Environment ${env} is not available`) {
                return [];
              }
              throw new Error(data.detail || "Failed to fetch pending changes");
            });
          }
          if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);
          return r.json();
        })
        .then((data) =>
          setPendingChanges((prev) => ({
            ...prev,
            [env]: Array.isArray(data) ? data : [],
          }))
        )
        .catch((e) => {
          console.error("Error refreshing pending changes:", e); // Log this error but don't necessarily show popup
        });
    } catch (e: unknown) {
      setPopup({
        open: true,
        title: "Error",
        desc: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRollbackLoading("");
    }
  };

  if (!auth.isLoggedIn) {
    return (
      <Dialog open={showLogin}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Login</DialogTitle>
            <DialogDescription>
              Enter your username and password to continue.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <input
              ref={usernameRef}
              type="text"
              placeholder="Username"
              className="border rounded px-3 py-2"
              autoFocus
            />
            <input
              ref={passwordRef}
              type="password"
              placeholder="Password"
              className="border rounded px-3 py-2"
            />
          </div>
          <DialogFooter>
            <Button onClick={handleLogin}>Login</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-end mb-4 items-center gap-4">
        <span className="text-sm">
          Logged in as <b>{auth.username}</b>
        </span>
        <Button variant="secondary" onClick={handleLogout}>
          Logout
        </Button>
      </div>
      <Tabs value={activeEnv} onValueChange={setActiveEnv}>
        <TabsList className="mb-6">
          {ENVIRONMENTS.map((env) => (
            <TabsTrigger key={env} value={env}>
              {env.toUpperCase()}
            </TabsTrigger>
          ))}
        </TabsList>
        {ENVIRONMENTS.map((env) => (
          <TabsContent key={env} value={env}>
            <div className="mb-4 flex flex-col md:flex-row gap-4 items-stretch">
              <MultiSelect
                options={(databases[env] || []).map((db) => ({
                  label: db,
                  value: db,
                }))}
                onValueChange={(selected: string[]) =>
                  setSelectedDBs((prev) => ({ ...prev, [env]: selected }))
                }
                defaultValue={selectedDBs[env]}
                placeholder="Select DB(s)"
                className="w-64 flex-1"
              />
              {env === "qa" ||
                (env === "production" && (
                  <Button
                    onClick={() => setShowCreateDialog(true)}
                    disabled={!selectedDBs[env]?.length}
                  >
                    Create New Change
                  </Button>
                ))}
            </div>
            {/* Pending Changes Table */}
            {env !== "qa" && (
              <>
                <h2 className="text-lg font-semibold mb-2">Pending Changes</h2>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>SQL</TableHead>
                      <TableHead>Target Databases</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(pendingChanges[env] || []).map((change) => (
                      <TableRow key={change.change_id}>
                        <TableCell>{change.change_id}</TableCell>
                        <TableCell>{change.description}</TableCell>
                        <TableCell>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm">
                                View SQL
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[600px] p-0">
                              <div className="space-y-4 p-4">
                                <SQLEditor
                                  value={change.sql_content}
                                  title="SQL Content"
                                  onChange={() => {}}
                                  minHeight="200px"
                                  className="bg-background"
                                />
                              </div>
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                        <TableCell>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm">
                                {isAllTenantsSelected(
                                  change.target_databases,
                                  databases[env] || []
                                )
                                  ? "All Tenants"
                                  : `${
                                      change.target_databases?.length || 0
                                    } DBs`}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-72 p-0">
                              <Command>
                                <CommandList>
                                  <CommandGroup>
                                    {change.target_databases?.length ? (
                                      change.target_databases.map((db) => (
                                        <CommandItem
                                          key={db}
                                          className="cursor-default"
                                        >
                                          {db}
                                        </CommandItem>
                                      ))
                                    ) : (
                                      <CommandItem className="cursor-default text-muted-foreground">
                                        No target databases
                                      </CommandItem>
                                    )}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              disabled={applyLoading === change.change_id}
                              onClick={() => {
                                if (!selectedDBs[env]?.length) {
                                  setPopup({
                                    open: true,
                                    title: "Error",
                                    desc: "Select at least one database to apply",
                                  });
                                  return;
                                }
                                handleApplyChange(env, change);
                              }}
                              title={
                                !selectedDBs[env]?.length
                                  ? "Select at least one database to apply"
                                  : ""
                              }
                            >
                              {applyLoading === change.change_id
                                ? "Applying..."
                                : "Apply"}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setAlterSQL(change.sql_content); // Pre-fill SQL for alteration
                                setAlterReason(""); // Clear previous reason
                                setAlterDialog({ open: true, change });
                              }}
                            >
                              Alter
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
            {/* All Changes Table */}
            <h2 className="text-lg font-semibold mt-8 mb-2">All Changes</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>SQL</TableHead>
                  <TableHead>Target Databases</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(allChanges[env] || []).map((change) => {
                  const isPending =
                    !change.applied_to?.length && !change.is_rolled_back;
                  const isApplied =
                    !!change.applied_to?.length && !change.is_rolled_back;
                  const isRolledBack = !!change.is_rolled_back;
                  let statusText = "Pending";
                  if (isApplied) statusText = "Applied";
                  if (isRolledBack) statusText = "Rolled Back";

                  return (
                    <TableRow key={change.change_id}>
                      <TableCell>{change.change_id}</TableCell>
                      <TableCell>{change.description}</TableCell>
                      <TableCell>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm">
                              View SQL
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[600px] p-0">
                            <div className="space-y-4 p-4">
                              <SQLEditor
                                value={change.sql_content}
                                title="SQL Content"
                                onChange={() => {}}
                                minHeight="200px"
                                className="bg-background"
                              />
                              {change.original_sql_content &&
                                change.original_sql_content !==
                                  change.sql_content && (
                                  <>
                                    <SQLEditor
                                      value={change.original_sql_content}
                                      title="Original SQL"
                                      onChange={() => {}}
                                      minHeight="200px"
                                      className="bg-muted"
                                    />
                                  </>
                                )}
                              {change.alterations &&
                                change.alterations.length > 0 && (
                                  <>
                                    <hr className="my-2" />
                                    <h4 className="text-xs font-semibold mb-1">
                                      Alterations:
                                    </h4>
                                    {change.alterations.map((alt, idx) => (
                                      <div
                                        key={idx}
                                        className="text-xs mb-1 text-muted-foreground"
                                      >
                                        <span className="font-medium">
                                          {new Date(
                                            alt.timestamp
                                          ).toLocaleString()}
                                        </span>{" "}
                                        by {alt.altered_by}: {alt.reason}
                                      </div>
                                    ))}
                                  </>
                                )}
                              {change.rollback_sql && (
                                <>
                                  <hr className="my-2" />
                                  <SQLEditor
                                    value={change.rollback_sql}
                                    onChange={() => {}}
                                    title="Rollback SQL"
                                    minHeight="200px"
                                    className="bg-muted"
                                  />
                                </>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      <TableCell>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm">
                              {isAllTenantsSelected(
                                change.target_databases,
                                databases[env] || []
                              )
                                ? "All Tenants"
                                : `${change.target_databases?.length || 0} DBs`}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 p-0">
                            <Command>
                              <CommandList>
                                <CommandGroup>
                                  {change.target_databases?.length ? (
                                    change.target_databases.map((db) => (
                                      <CommandItem
                                        key={db}
                                        className="cursor-default"
                                      >
                                        {db}
                                      </CommandItem>
                                    ))
                                  ) : (
                                    <CommandItem className="cursor-default text-muted-foreground">
                                      No target databases
                                    </CommandItem>
                                  )}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      <TableCell>{statusText}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {isPending && (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                disabled={applyLoading === change.change_id}
                                onClick={() => handleApplyChange(env, change)}
                                title={
                                  !selectedDBs[env]?.length
                                    ? "Select at least one database to apply"
                                    : ""
                                }
                              >
                                {applyLoading === change.change_id
                                  ? "Applying..."
                                  : "Apply"}
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setAlterSQL(change.sql_content); // Pre-fill SQL
                                  setAlterReason(""); // Clear reason
                                  setAlterDialog({ open: true, change });
                                }}
                              >
                                Alter
                              </Button>
                            </>
                          )}
                          {isApplied && (
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={
                                rollbackLoading === change.change_id ||
                                !change.rollback_sql
                              }
                              onClick={() => handleRollbackChange(env, change)}
                              title={
                                !change.rollback_sql
                                  ? "No rollback SQL defined for this change"
                                  : ""
                              }
                            >
                              {rollbackLoading === change.change_id
                                ? "Rolling Back..."
                                : "Rollback"}
                            </Button>
                          )}
                          {isRolledBack && (
                            <span className="text-xs text-muted-foreground italic">
                              No actions
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TabsContent>
        ))}
      </Tabs>

      {/* Create Change Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Change (QA)</DialogTitle>
            <DialogDescription>
              Enter SQL, description, and optional rollback SQL.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <SQLEditor
              value={createSQL}
              onChange={(value) => setCreateSQL(value || "")}
              minHeight="200px"
              title="SQL Content"
            />
            <Textarea
              placeholder="Description"
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
              className="min-h-[40px]"
            />
            <SQLEditor
              value={createRollback}
              onChange={(value) => setCreateRollback(value || "")}
              minHeight="100px"
              title="Rollback SQL"
              placeholder="Rollback SQL (optional)"
            />
          </div>
          <DialogFooter>
            <Button onClick={handleCreateChange} disabled={createLoading}>
              {createLoading ? "Creating..." : "Create"}
            </Button>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alter Change Dialog */}
      <Dialog
        open={alterDialog.open}
        onOpenChange={(open) =>
          setAlterDialog((prev) => ({
            ...prev,
            open,
            change: open ? prev.change : null,
          }))
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alter Change</DialogTitle>
            <DialogDescription>
              Modify the SQL and provide a reason for alteration.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <SQLEditor
              value={alterSQL}
              onChange={(value) => setAlterSQL(value || "")}
              minHeight="200px"
            />
            <Textarea
              placeholder="Reason for alteration"
              value={alterReason}
              onChange={(e) => setAlterReason(e.target.value)}
              className="min-h-[40px]"
            />
          </div>
          <DialogFooter>
            <Button onClick={handleAlterChange}>Alter</Button>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success/Error Popup */}
      <Dialog
        open={popup.open}
        onOpenChange={(open) => setPopup((prev) => ({ ...prev, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{popup.title}</DialogTitle>
            <DialogDescription>{popup.desc}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
