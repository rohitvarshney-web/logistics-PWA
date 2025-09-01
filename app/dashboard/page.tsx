'use client';

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("application");

  return (
    <div className="p-6 space-y-6">
      {/* Order Header Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                🇺🇸 United States of America
              </h3>
              <p className="text-sm text-gray-500">Order ID: SMV-USA-00633</p>
              <p className="text-sm text-gray-500">Travel Dates: Oct 09 – Oct 16</p>
              <p className="text-sm text-gray-500">Travellers: 1</p>
            </div>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
              Classify Documents
            </Button>
          </CardHeader>
          <CardContent className="text-sm text-gray-600 space-y-1">
            <p>
              <strong>Note from TA:</strong> Questionnaire link here
            </p>
            <p>
              <strong>Remarks:</strong> Add new / View all
            </p>
            <p>
              <strong>Created By:</strong> Hardik, Jul 10 04:52 PM
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-semibold">Tourist Visa</h3>
              <Badge variant="outline" className="bg-blue-50 text-blue-600 mt-2">
                Ready to Submit
              </Badge>
            </div>
            <Button size="sm" variant="outline">
              Upload Documents
            </Button>
          </CardHeader>
          <CardContent className="text-sm text-gray-600 space-y-1">
            <p>
              <strong>Travel Agency:</strong> ORGO.travel
            </p>
            <p>
              <strong>Estimate:</strong> EST-USA-00633
            </p>
            <p>
              <strong>Assignee:</strong> Sunder Upreti
            </p>
            <p className="text-blue-600 cursor-pointer">+ Add-ons</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Section */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-gray-100 rounded-lg p-1">
          <TabsTrigger value="application" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Application
          </TabsTrigger>
          <TabsTrigger value="documents" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Documents
          </TabsTrigger>
          <TabsTrigger value="comms" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Comms
          </TabsTrigger>
        </TabsList>

        <TabsContent value="application" className="mt-4">
          <Card>
            <CardContent>
              {/* Traveller Table */}
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50 text-left">
                  <tr>
                    <th className="p-2">
                      <Checkbox />
                    </th>
                    <th className="p-2">Traveller</th>
                    <th className="p-2">Application Status</th>
                    <th className="p-2">Visa Fee Category</th>
                    <th className="p-2">Jurisdiction</th>
                    <th className="p-2">Embassy Ref ID</th>
                    <th className="p-2">Appointment</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-2">
                      <Checkbox />
                    </td>
                    <td className="p-2 font-medium">POOJA SRIRAM</td>
                    <td className="p-2">
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">
                        Ready to Submit
                      </Badge>
                    </td>
                    <td className="p-2 text-blue-600 cursor-pointer">+ Add</td>
                    <td className="p-2">---</td>
                    <td className="p-2">
                      <Button size="sm" variant="outline">
                        Add Embassy Ref ID
                      </Button>
                    </td>
                    <td className="p-2 text-blue-600 cursor-pointer">Select Date</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardContent>No documents uploaded yet.</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comms" className="mt-4">
          <Card>
            <CardContent>Communication log here.</CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
