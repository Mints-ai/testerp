"use client";

import { useState, useEffect } from "react";
import { collection, query, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/utils";
import { generatePayslip } from "@/lib/pdfGenerator";
import { Banknote, FileDown, Calculator, Download } from "lucide-react";
import { motion } from "framer-motion";

interface PayrollData {
  userId: string;
  name: string;
  role: string;
  avatar: string;
  baseSalary: number;
  unpaidLeaves: number;
  deductions: number;
  netPay: number;
  status: "Paid" | "Pending";
}

export default function PayrollDashboard() {
  const [payroll, setPayroll] = useState<PayrollData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPayroll = async () => {
      try {
        // Fetch all active employees
        const employeesSnap = await getDocs(collection(db, "employees"));
        // Fetch all approved leaves to aggregate unpaid time off
        const leavesSnap = await getDocs(collection(db, "leaves"));
        
        const unpaidLeavesByEmployee: Record<string, number> = {};
        leavesSnap.forEach(lDoc => {
          const leave = lDoc.data();
          // Aggregate leaves that are approved and of type Unpaid Leave
          if (
            leave.status === "approved" && 
            (leave.leaveType === "Unpaid Leave" || leave.leaveType?.toLowerCase().includes("unpaid"))
          ) {
            const empId = leave.userId || leave.employeeId;
            if (empId) {
              const start = new Date(leave.startDate);
              const end = new Date(leave.endDate);
              const diffTime = Math.abs(end.getTime() - start.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Inclusive days count
              unpaidLeavesByEmployee[empId] = (unpaidLeavesByEmployee[empId] || 0) + diffDays;
            }
          }
        });

        const payrollData: PayrollData[] = [];
        employeesSnap.forEach(doc => {
          const emp = doc.data();
          if (!emp.isActive) return; // Skip inactive personnel
          
          // Role-based Base Salary structure
          let baseSalary = 8000;
          if (emp.role === "founder") baseSalary = 25000;
          else if (emp.role === "c_suite") baseSalary = 18000;
          else if (emp.role === "manager") baseSalary = 12000;
          else if (emp.role === "senior_employee") baseSalary = 9500;
          else if (emp.role === "employee") baseSalary = 8000;
          else if (emp.role === "intern") baseSalary = 4000;

          // Aggregated unpaid leaves
          const unpaidLeaves = unpaidLeavesByEmployee[doc.id] || 0;
          
          // Deduction calculation (prorated by 30-day corporate schedule)
          const dailyRate = baseSalary / 30;
          const deductions = Math.round(unpaidLeaves * dailyRate);
          const netPay = Math.max(0, baseSalary - deductions);

          payrollData.push({
            userId: doc.id,
            name: emp.fullName || "Mints Team Member",
            role: emp.role || "Employee",
            avatar: emp.profilePhotoURL || "",
            baseSalary,
            unpaidLeaves,
            deductions,
            netPay,
            status: unpaidLeaves > 0 ? "Pending" : "Paid" // Default to pending if there are deductions for manual review
          });
        });

        // Sort pending payroll first
        payrollData.sort((a, b) => (a.status === "Pending" ? -1 : 1));
        setPayroll(payrollData);
      } catch (err) {
        console.error("Error loading payroll dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPayroll();
  }, []);

  const handleGeneratePayslip = (data: PayrollData) => {
    const date = new Date();
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();

    generatePayslip({
      payslipNumber: `PS-${Math.floor(1000 + Math.random() * 9000)}`,
      employeeName: data.name,
      role: data.role,
      period: `${month} ${year}`,
      baseSalary: data.baseSalary,
      deductions: data.deductions,
      netPay: data.netPay,
      unpaidLeaves: data.unpaidLeaves
    });
  };

  const totalPayroll = payroll.reduce((sum, p) => sum + p.netPay, 0);

  return (
    <RoleGuard permission="MANAGE_USERS" fallback={<div className="p-8 text-center text-white/40 font-bold uppercase tracking-wider text-xs">Access Denied. Only authorized HR personnel can run payroll metrics.</div>}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Payroll & Compensation</h1>
            <p className="text-white/40 mt-1">Manage salaries, pro-rate unpaid leave deductions, and generate secure payslips.</p>
          </div>
          
          <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-md rounded-xl font-semibold h-10 px-5">
            <Calculator className="mr-2 h-4 w-4" /> Run Payroll Cycle
          </Button>
        </div>

        {/* Overview Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-slate-200 shadow-sm bg-white rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-wider">Total Net Disbursements</CardTitle>
              <Banknote className="h-4 w-4 text-olive-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-slate-900 tabular-nums">{totalPayroll.toLocaleString()} AED</div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm bg-white rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-wider">Pending Approvals</CardTitle>
              <Banknote className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-amber-600 tabular-nums">
                {payroll.filter(p => p.status === 'Pending').length} Employees
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm bg-white rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-wider">Active Deductions (Unpaid Leaves)</CardTitle>
              <Calculator className="h-4 w-4 text-rose-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-slate-900 tabular-nums">
                {payroll.reduce((sum, p) => sum + p.deductions, 0).toLocaleString()} AED
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payroll Table */}
        <Card className="border-slate-200 bg-white rounded-2xl shadow-sm overflow-hidden">
          <CardHeader className="pb-4 border-b border-slate-100">
            <CardTitle className="text-base font-bold text-slate-900">Salary Disbursements Ledger</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="h-40 flex items-center justify-center text-slate-500 font-medium">Aggregating attendance and leave deductions...</div>
            ) : payroll.length === 0 ? (
              <div className="text-center py-12 p-6 flex flex-col items-center">
                <Banknote className="h-10 w-10 text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-800">No Personnel Found</p>
                <p className="text-xs text-slate-500 mt-1">There are no active employees in the system to run payroll disbursements for.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4">Employee</th>
                      <th className="px-6 py-4">Base Salary</th>
                      <th className="px-6 py-4 text-rose-600">Deductions (Unpaid Leaves)</th>
                      <th className="px-6 py-4 text-emerald-600">Net Pay</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Payslip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-semibold">
                    {payroll.map((record, i) => (
                      <motion.tr 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        key={record.userId} 
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9 border border-slate-100">
                              <AvatarImage src={record.avatar} />
                              <AvatarFallback className="bg-olive-50 text-olive-700 text-xs font-bold">
                                {getInitials(record.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-bold text-slate-900">{record.name}</div>
                              <div className="text-xs text-slate-500 uppercase tracking-wider font-bold mt-0.5">{record.role?.replace("_", " ")}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-600 tabular-nums">{record.baseSalary.toLocaleString()} AED</td>
                        <td className="px-6 py-4 font-medium text-rose-600 tabular-nums">
                          {record.deductions > 0 ? `-${record.deductions.toLocaleString()} AED` : '0 AED'}
                          {record.unpaidLeaves > 0 && <span className="block text-[10px] text-rose-400 font-bold mt-0.5">({record.unpaidLeaves} days Unpaid Leave)</span>}
                        </td>
                        <td className="px-6 py-4 font-bold text-emerald-600 tabular-nums">{record.netPay.toLocaleString()} AED</td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" className={`font-bold shadow-none border ${
                            record.status === 'Paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {record.status.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-olive-600 hover:text-olive-900 hover:bg-olive-50 rounded-xl"
                            onClick={() => handleGeneratePayslip(record)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}
