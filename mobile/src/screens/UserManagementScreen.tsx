import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import {
  getStaffUsers,
  updateStaffRole,
  createStaffMember,
  StaffUser,
} from '../services/userService';

interface UserManagementScreenProps {
  onBack: () => void;
  currentAdminId?: string;
}

const ROLES_SPEC = [
  {
    id: 'OPERATOR',
    label: 'Warehouse Operator',
    color: '#38BDF8',
    bg: 'rgba(56, 189, 248, 0.15)',
    desc: 'Scan barcodes & OCR labels, verify deliveries, pick items & perform stock counts.',
  },
  {
    id: 'SUPERVISOR',
    label: 'Supervisor',
    color: '#8B5CF6',
    bg: 'rgba(139, 92, 246, 0.15)',
    desc: 'Review discrepancies, approve override exceptions & order bay recounts.',
  },
  {
    id: 'INVENTORY_ADMIN',
    label: 'Inventory Administrator',
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.15)',
    desc: 'Maintain product catalog, register batches & allocate warehouse rack locations.',
  },
  {
    id: 'SYSTEM_ADMIN',
    label: 'System Administrator',
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.15)',
    desc: 'Manage staff accounts, assign roles, configure workflows & system controls.',
  },
];

export default function UserManagementScreen({ onBack, currentAdminId }: UserManagementScreenProps) {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'OPERATOR' | 'SUPERVISOR' | 'INVENTORY_ADMIN' | 'SYSTEM_ADMIN'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Role Assignment Modal State
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<StaffUser | null>(null);
  const [chosenRole, setChosenRole] = useState('OPERATOR');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  // Create User Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('OPERATOR');
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  const loadUsers = async () => {
    try {
      const data = await getStaffUsers();
      setUsers(data);
    } catch (err) {
      console.warn('Failed to load staff users:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadUsers();
  };

  // Metrics calculation
  const metrics = useMemo(() => {
    return {
      total: users.length,
      operators: users.filter((u) => u.role === 'OPERATOR').length,
      supervisors: users.filter((u) => u.role === 'SUPERVISOR').length,
      inventoryAdmins: users.filter((u) => u.role === 'INVENTORY_ADMIN').length,
      systemAdmins: users.filter((u) => u.role === 'SYSTEM_ADMIN').length,
    };
  }, [users]);

  // Filtered staff list
  const filteredUsers = useMemo(() => {
    let result = users;
    if (selectedFilter !== 'ALL') {
      result = result.filter((u) => u.role === selectedFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.id.toLowerCase().includes(q)
      );
    }
    return result;
  }, [users, selectedFilter, searchQuery]);

  // Open Role Modal
  const openRoleModal = (user: StaffUser) => {
    setSelectedUser(user);
    setChosenRole(user.role);
    setIsRoleModalOpen(true);
  };

  // Submit Role Change
  const handleUpdateRole = async () => {
    if (!selectedUser) return;

    if (selectedUser.role === chosenRole) {
      setIsRoleModalOpen(false);
      return;
    }

    setIsUpdatingRole(true);
    try {
      const res = await updateStaffRole(selectedUser.id, chosenRole);
      if (res.success) {
        Alert.alert(
          'Role Updated',
          `${selectedUser.username}'s role changed from ${selectedUser.role} to ${chosenRole}.`
        );
        setUsers((prev) =>
          prev.map((u) => (u.id === selectedUser.id ? { ...u, role: chosenRole } : u))
        );
        setIsRoleModalOpen(false);
      } else {
        Alert.alert('Update Failed', res.error || 'Failed to update role');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update role');
    } finally {
      setIsUpdatingRole(false);
    }
  };

  // Submit New Staff Account
  const handleCreateStaff = async () => {
    if (!newUsername.trim() || !newEmail.trim() || !newPassword) {
      Alert.alert('Validation Error', 'Name, Email, and Password are required.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail.trim())) {
      Alert.alert('Validation Error', 'Please enter a valid email address.');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Validation Error', 'Password must be at least 6 characters.');
      return;
    }

    setIsCreatingUser(true);
    try {
      const res = await createStaffMember({
        username: newUsername.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      });

      if (res.success && res.user) {
        Alert.alert(
          'Staff Account Created',
          `Account for ${res.user.username} (${res.user.role}) has been created.`
        );
        setUsers((prev) => [res.user!, ...prev]);
        setIsCreateModalOpen(false);
        setNewUsername('');
        setNewEmail('');
        setNewPassword('');
        setNewRole('OPERATOR');
      } else {
        Alert.alert('Registration Failed', res.error || 'Failed to create staff account');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create staff account');
    } finally {
      setIsCreatingUser(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#F8FAFC" />
        </TouchableOpacity>
        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerTitle}>Staff & Role Management</Text>
          <Text style={styles.headerSubtitle}>System Administrator RBAC Controls (BRD 2.2)</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh} activeOpacity={0.7}>
          <Ionicons name="reload" size={18} color="#F59E0B" />
        </TouchableOpacity>
      </View>

      {/* Top Metrics Row */}
      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricVal}>{metrics.total}</Text>
          <Text style={styles.metricLbl}>Total Staff</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={[styles.metricVal, { color: '#38BDF8' }]}>{metrics.operators}</Text>
          <Text style={styles.metricLbl}>Operators</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={[styles.metricVal, { color: '#8B5CF6' }]}>{metrics.supervisors}</Text>
          <Text style={styles.metricLbl}>Supervisors</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={[styles.metricVal, { color: '#10B981' }]}>{metrics.inventoryAdmins}</Text>
          <Text style={styles.metricLbl}>Inv Admin</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={[styles.metricVal, { color: '#F59E0B' }]}>{metrics.systemAdmins}</Text>
          <Text style={styles.metricLbl}>Sys Admin</Text>
        </View>
      </View>

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChipScroll}
      >
        <TouchableOpacity
          style={[styles.filterChip, selectedFilter === 'ALL' && styles.filterChipActive]}
          onPress={() => setSelectedFilter('ALL')}
        >
          <Text style={[styles.filterChipText, selectedFilter === 'ALL' && styles.filterChipTextActive]}>
            All ({metrics.total})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, selectedFilter === 'OPERATOR' && styles.filterChipActive]}
          onPress={() => setSelectedFilter('OPERATOR')}
        >
          <Text style={[styles.filterChipText, selectedFilter === 'OPERATOR' && styles.filterChipTextActive]}>
            Operators ({metrics.operators})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, selectedFilter === 'SUPERVISOR' && styles.filterChipActive]}
          onPress={() => setSelectedFilter('SUPERVISOR')}
        >
          <Text style={[styles.filterChipText, selectedFilter === 'SUPERVISOR' && styles.filterChipTextActive]}>
            Supervisors ({metrics.supervisors})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, selectedFilter === 'INVENTORY_ADMIN' && styles.filterChipActive]}
          onPress={() => setSelectedFilter('INVENTORY_ADMIN')}
        >
          <Text style={[styles.filterChipText, selectedFilter === 'INVENTORY_ADMIN' && styles.filterChipTextActive]}>
            Inv Admins ({metrics.inventoryAdmins})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, selectedFilter === 'SYSTEM_ADMIN' && styles.filterChipActive]}
          onPress={() => setSelectedFilter('SYSTEM_ADMIN')}
        >
          <Text style={[styles.filterChipText, selectedFilter === 'SYSTEM_ADMIN' && styles.filterChipTextActive]}>
            Sys Admins ({metrics.systemAdmins})
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Search & Add Bar */}
      <View style={styles.actionBar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search staff by name or email..."
            placeholderTextColor="#64748B"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="#64748B" />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={styles.newStaffBtn}
          onPress={() => setIsCreateModalOpen(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="person-add" size={16} color="#FFFFFF" />
          <Text style={styles.newStaffBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      {/* Staff List */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#F59E0B" />
          <Text style={styles.loadingText}>Loading staff accounts...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#F59E0B" />
          }
        >
          {filteredUsers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color="#64748B" />
              <Text style={styles.emptyTitle}>No Staff Members Found</Text>
              <Text style={styles.emptySubtitle}>Try adjusting your filter or search query.</Text>
            </View>
          ) : (
            filteredUsers.map((u) => {
              const roleSpec = ROLES_SPEC.find((r) => r.id === u.role) || ROLES_SPEC[0];
              const initials = u.username
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);

              return (
                <View key={u.id} style={styles.userCard}>
                  <View style={styles.userCardTop}>
                    <View style={styles.avatarBox}>
                      <Text style={styles.avatarText}>{initials || 'US'}</Text>
                    </View>
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>{u.username}</Text>
                      <Text style={styles.userEmail}>{u.email}</Text>
                      <Text style={styles.userIdText}>ID: {u.id}</Text>
                    </View>
                    <View style={[styles.roleBadge, { backgroundColor: roleSpec.bg }]}>
                      <Text style={[styles.roleBadgeText, { color: roleSpec.color }]}>
                        {roleSpec.label}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.userCardBottom}>
                    <View style={styles.metaCol}>
                      <Text style={styles.metaLbl}>Permissions</Text>
                      <Text style={styles.metaVal}>{roleSpec.desc}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.changeRoleBtn}
                      onPress={() => openRoleModal(u)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="shield-outline" size={14} color="#F59E0B" />
                      <Text style={styles.changeRoleBtnText}>Change Role</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* MODAL 1: CHANGE ROLE */}
      <Modal visible={isRoleModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="shield-half" size={20} color="#F59E0B" />
                <Text style={styles.modalTitle}>Assign Staff Role</Text>
              </View>
              <TouchableOpacity onPress={() => setIsRoleModalOpen(false)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {selectedUser && (
              <View style={styles.targetUserBox}>
                <Text style={styles.targetUserName}>{selectedUser.username}</Text>
                <Text style={styles.targetUserEmail}>{selectedUser.email}</Text>
              </View>
            )}

            <Text style={styles.rolePickerHeading}>Select New System Role (BRD 2.2):</Text>
            <View style={styles.rolesList}>
              {ROLES_SPEC.map((r) => {
                const isSelected = chosenRole === r.id;
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={[
                      styles.roleOptionCard,
                      isSelected && { borderColor: r.color, backgroundColor: r.bg },
                    ]}
                    onPress={() => setChosenRole(r.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.roleOptionHeader}>
                      <View style={styles.roleOptionLeft}>
                        <Ionicons
                          name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                          size={18}
                          color={isSelected ? r.color : '#64748B'}
                        />
                        <Text style={[styles.roleOptionLabel, isSelected && { color: r.color }]}>
                          {r.label}
                        </Text>
                      </View>
                      <View style={[styles.roleTagSmall, { backgroundColor: r.bg }]}>
                        <Text style={[styles.roleTagSmallText, { color: r.color }]}>{r.id}</Text>
                      </View>
                    </View>
                    <Text style={styles.roleOptionDesc}>{r.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setIsRoleModalOpen(false)}
                disabled={isUpdatingRole}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitRoleBtn}
                onPress={handleUpdateRole}
                disabled={isUpdatingRole}
              >
                {isUpdatingRole ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitRoleBtnText}>Confirm Role</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: CREATE STAFF */}
      <Modal visible={isCreateModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="person-add" size={20} color="#10B981" />
                <Text style={styles.modalTitle}>Create Staff Account</Text>
              </View>
              <TouchableOpacity onPress={() => setIsCreateModalOpen(false)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Staff Full Name *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. Ramesh Kumar"
                  placeholderTextColor="#64748B"
                  value={newUsername}
                  onChangeText={setNewUsername}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Email Address *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. ramesh@congiotech.com"
                  placeholderTextColor="#64748B"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={newEmail}
                  onChangeText={setNewEmail}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Initial Password * (min 6 chars)</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. password123"
                  placeholderTextColor="#64748B"
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Assign Initial Role</Text>
                <View style={styles.rolePillsRow}>
                  {ROLES_SPEC.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      style={[
                        styles.rolePillOption,
                        newRole === r.id && {
                          borderColor: r.color,
                          backgroundColor: r.bg,
                        },
                      ]}
                      onPress={() => setNewRole(r.id)}
                    >
                      <Text
                        style={[
                          styles.rolePillOptionText,
                          newRole === r.id && { color: r.color, fontWeight: '700' },
                        ]}
                      >
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setIsCreateModalOpen(false)}
                disabled={isCreatingUser}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.createAccountBtn}
                onPress={handleCreateStaff}
                disabled={isCreatingUser}
              >
                {isCreatingUser ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.createAccountBtnText}>Create Account</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTitleGroup: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  metricsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  metricVal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  metricLbl: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 2,
  },
  filterChipScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterChipActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#F59E0B',
  },
  filterChipText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#F59E0B',
  },
  actionBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  searchInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 13,
    padding: 0,
  },
  newStaffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  newStaffBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
  },
  userCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  userCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#38BDF8',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  userEmail: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 1,
  },
  userIdText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  userCardBottom: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  metaCol: {
    flex: 1,
  },
  metaLbl: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 2,
  },
  metaVal: {
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 15,
  },
  changeRoleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  changeRoleBtnText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '700',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  targetUserBox: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  targetUserName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  targetUserEmail: {
    fontSize: 12,
    color: '#38BDF8',
    marginTop: 2,
  },
  rolePickerHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 10,
  },
  rolesList: {
    gap: 8,
    marginBottom: 16,
  },
  roleOptionCard: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 12,
  },
  roleOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  roleOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleOptionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  roleTagSmall: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  roleTagSmallText: {
    fontSize: 9,
    fontWeight: '700',
  },
  roleOptionDesc: {
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 15,
    marginLeft: 26,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  submitRoleBtn: {
    flex: 1.5,
    backgroundColor: '#F59E0B',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitRoleBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Create staff form
  formGroup: {
    marginBottom: 12,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#F8FAFC',
    fontSize: 13,
  },
  rolePillsRow: {
    gap: 6,
  },
  rolePillOption: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  rolePillOptionText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  createAccountBtn: {
    flex: 1.5,
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  createAccountBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
