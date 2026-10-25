import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nest/ui/components/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@nest/ui/components/tabs';
import { ArrowDownUp, ChartNoAxesCombined, Route } from 'lucide-react';
import { useState } from 'react';

import { AssetSelect, DecimalField, ReviewRequirements, UnavailableFacts } from '../components/financial-draft.tsx';
import { DraftNotice, EmptyState, PageHeader } from '../components/workspace.tsx';

const INTERVALS = ['15m', '1h', '4h', '1d'];

export function TradePage() {
  const [inputAsset, setInputAsset] = useState('XLM');
  const [outputAsset, setOutputAsset] = useState('USDC');
  const [amount, setAmount] = useState('');
  const [interval, setInterval] = useState('1h');

  function reversePair() {
    setInputAsset(outputAsset);
    setOutputAsset(inputAsset);
    setAmount('');
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={`${inputAsset} / ${outputAsset}`}
        kicker="Trade · exact-input swaps"
        description="Inspect price context, compare routes at your size, and review the exact asset changes before signing."
        actions={<Badge variant="outline">Live quotes not connected</Badge>}
      />
      <DraftNotice>
        Build an unsaved swap draft. Asset eligibility, balances, prices and routes are not verified by this form.
      </DraftNotice>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] 2xl:grid-cols-[minmax(0,1fr)_15rem_21rem]">
        <Card className="min-w-0 gap-0 py-0">
          <CardHeader className="gap-4 border-b py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-lg">Reference price</CardTitle>
              <fieldset className="flex flex-wrap gap-1">
                <legend className="sr-only">Chart interval</legend>
                {INTERVALS.map((item) => (
                  <Button
                    key={item}
                    className="min-h-11"
                    variant={interval === item ? 'secondary' : 'ghost'}
                    aria-pressed={interval === item}
                    onClick={() => setInterval(item)}
                  >
                    {item}
                  </Button>
                ))}
              </fieldset>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {['Reference price', '24h change', '24h volume'].map((label) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 font-mono text-lg text-subtle">—</p>
                </div>
              ))}
            </div>
          </CardHeader>
          <CardContent className="flex min-h-72 flex-col items-center justify-center p-5">
            <ChartNoAxesCombined className="mb-4 size-8 text-subtle" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Price history is not connected</h2>
            <p className="mt-2 max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
              No verified {interval} history is available for this pair. A chart price would provide context, not an
              executable quote.
            </p>
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:col-start-1 2xl:col-start-2 2xl:row-start-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Route className="size-4" />
              Routes
            </CardTitle>
            <CardDescription>Compare minimum output and all fees.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Badge variant="outline">Soroswap aggregation</Badge>
            <UnavailableFacts
              labels={['Expected output', 'Minimum received', 'Price impact', 'Maximum fees', 'Quote expiry']}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Route comparison is unavailable until a fresh amount-specific quote is connected. No route or fill is
              implied.
            </p>
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 2xl:col-start-3 2xl:row-span-1">
          <CardHeader>
            <CardTitle className="text-2xl">Market swap</CardTitle>
            <CardDescription>Exact input · unsaved draft</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <AssetSelect label="You pay" value={inputAsset} onChange={setInputAsset} />
            <DecimalField
              label="Amount"
              unit={inputAsset}
              value={amount}
              onChange={setAmount}
              hint="Spendable balance is unavailable. Max requires a verified balance and reserve check."
            />
            <div className="flex justify-center">
              <Button
                variant="outline"
                className="min-h-11"
                onClick={reversePair}
                aria-label="Reverse input and output assets"
              >
                <ArrowDownUp />
                Reverse pair
              </Button>
            </div>
            <AssetSelect label="You receive" value={outputAsset} onChange={setOutputAsset} />
            {inputAsset === outputAsset ? (
              <p role="alert" className="text-sm text-destructive">
                Choose different input and output assets.
              </p>
            ) : null}
            <UnavailableFacts labels={['Estimated receive amount', 'Minimum received', 'Approved fee maximum']} />
            <Button disabled className="min-h-11 w-full" aria-describedby="trade-unavailable">
              Review swap
            </Button>
            <p id="trade-unavailable" className="text-xs leading-relaxed text-muted-foreground">
              Live quotes and wallet approval are not available in this build. Your draft does not place an order.
            </p>
            <ReviewRequirements />
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:col-span-2 2xl:col-span-3">
          <CardHeader>
            <CardTitle className="text-xl">Wallet activity</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="swaps">
              <TabsList className="h-auto flex-wrap">
                <TabsTrigger className="min-h-11" value="swaps">
                  Swaps
                </TabsTrigger>
                <TabsTrigger className="min-h-11" value="pending">
                  Pending
                </TabsTrigger>
                <TabsTrigger className="min-h-11" value="history">
                  History
                </TabsTrigger>
              </TabsList>
              <TabsContent value="swaps">
                <EmptyState
                  title="No verified swaps to show"
                  description="Wallet activity becomes available after wallet access and transaction history are connected."
                />
              </TabsContent>
              <TabsContent value="pending">
                <EmptyState
                  title="Pending status unavailable"
                  description="A submitted transaction must be reconciled before its result can be shown here."
                />
              </TabsContent>
              <TabsContent value="history">
                <EmptyState
                  title="No loaded trade history"
                  description="Confirmed fills and fees will appear here when wallet history is available."
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
